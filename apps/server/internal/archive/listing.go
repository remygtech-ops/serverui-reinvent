package archive

import (
	"errors"
	"fmt"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type EntryKind int

const (
	KindFile EntryKind = iota
	KindDir
	KindSymlink
	KindHardlink
	KindOther
)

// Entry is one member of an archive as reported by the remote listing tool.
type Entry struct {
	Name      string
	Kind      EntryKind
	Link      string // symlink or hardlink target, when the listing exposes it
	Size      int64
	Encrypted bool
}

// Summary describes an archive that passed Inspect.
type Summary struct {
	Entries   int
	TotalSize int64
	TopLevel  []string
}

var (
	ErrEncrypted       = errors.New("password-protected archives are not supported")
	ErrEmpty           = errors.New("archive is empty")
	errUnreadableEntry = errors.New("unable to read archive listing")
)

// UnsafeError reports an archive member that could write outside the
// extraction folder or otherwise cannot be extracted safely.
type UnsafeError struct {
	Name   string
	Reason string
}

func (e *UnsafeError) Error() string {
	name := e.Name
	if len(name) > 120 {
		name = name[:117] + "..."
	}
	return fmt.Sprintf("archive was not extracted: entry %q %s", name, e.Reason)
}

// ParseTarListing parses `tar -tv` output from GNU tar, BusyBox tar or bsdtar.
func ParseTarListing(out string) ([]Entry, error) {
	var entries []Entry
	for _, line := range strings.Split(out, "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		fields, rest := splitFields(line, 5)
		if len(fields) < 5 || rest == "" {
			return nil, errUnreadableEntry
		}
		sizeField := fields[2]
		switch {
		case strings.Contains(fields[1], "/"):
			// GNU tar and BusyBox print "owner/group" then the size (or "major,minor" for devices).
			// Owner and group come from the archive, so a name with spaces shifts every column:
			// refuse any line whose size column does not look like one.
			if !tarSizeColumn.MatchString(sizeField) {
				return nil, errUnreadableEntry
			}
		case digitsOnly(fields[1]):
			// bsdtar: mode, links, owner, group, size, month, day, time-or-year.
			fields, rest = splitFields(line, 8)
			if len(fields) < 8 || rest == "" {
				return nil, errUnreadableEntry
			}
			sizeField = fields[4]
		default:
			return nil, errUnreadableEntry
		}
		entry := Entry{Kind: kindFromMode(fields[0])}
		size, err := strconv.ParseInt(sizeField, 10, 64)
		if err != nil {
			// Device nodes print "major,minor" instead of a size.
			entry.Kind = KindOther
		}
		entry.Size = size
		entry.Name = rest
		switch entry.Kind {
		case KindSymlink:
			name, link, ok := strings.Cut(rest, " -> ")
			if !ok {
				// Without the separator the target is unknown, so it cannot be vetted.
				return nil, errUnreadableEntry
			}
			entry.Name, entry.Link = name, link
		case KindHardlink, KindFile:
			if name, target, ok := strings.Cut(rest, " link to "); ok {
				entry.Name, entry.Link, entry.Kind = name, target, KindHardlink
			}
		}
		entries = append(entries, entry)
	}
	return entries, nil
}

var tarSizeColumn = regexp.MustCompile(`^(\d+|\d+,\s*\d+)$`)

func digitsOnly(v string) bool {
	if v == "" {
		return false
	}
	for _, r := range v {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

var zipModePattern = regexp.MustCompile(`^[-dl?][-rwxsStTa?]{5,9}$`)

// ParseZipListing parses `unzip -Z -s` (zipinfo short format) output.
// Header and totals lines are skipped because they do not start with a mode.
func ParseZipListing(out string) ([]Entry, error) {
	var entries []Entry
	for _, line := range strings.Split(out, "\n") {
		// mode, version, os, size, flags, method, date, time, then the name.
		fields, rest := splitFields(line, 8)
		if len(fields) < 8 || rest == "" || !zipModePattern.MatchString(fields[0]) {
			continue
		}
		size, err := strconv.ParseInt(fields[3], 10, 64)
		if err != nil {
			continue
		}
		// zipinfo prints "tx"/"bx"; an uppercase first letter means encrypted.
		flag := fields[4]
		entry := Entry{
			Name:      rest,
			Kind:      kindFromMode(fields[0]),
			Size:      size,
			Encrypted: flag != "" && flag[0] >= 'A' && flag[0] <= 'Z',
		}
		if strings.HasSuffix(rest, "/") {
			entry.Kind = KindDir
		}
		entries = append(entries, entry)
	}
	return entries, nil
}

// Parse7zListing parses `7z l -slt` output. Members follow the "----------"
// separator as blank-line separated "Key = Value" blocks.
func Parse7zListing(out string) ([]Entry, error) {
	var entries []Entry
	inMembers := false
	block := map[string]string{}
	flush := func() {
		if name := block["Path"]; name != "" {
			entries = append(entries, entryFrom7zBlock(block))
		}
		block = map[string]string{}
	}
	for _, raw := range strings.Split(out, "\n") {
		line := strings.TrimRight(raw, "\r")
		if !inMembers {
			inMembers = strings.HasPrefix(line, "----------")
			continue
		}
		if strings.TrimSpace(line) == "" {
			flush()
			continue
		}
		if key, value, ok := strings.Cut(line, " = "); ok {
			block[key] = value
		} else if key, ok := strings.CutSuffix(line, " ="); ok {
			block[key] = ""
		}
	}
	flush()
	if !inMembers {
		return nil, errUnreadableEntry
	}
	return entries, nil
}

func entryFrom7zBlock(block map[string]string) Entry {
	entry := Entry{
		Name:      block["Path"],
		Kind:      KindFile,
		Encrypted: block["Encrypted"] == "+",
	}
	entry.Size, _ = strconv.ParseInt(block["Size"], 10, 64)
	attrs := strings.Fields(block["Attributes"])
	switch {
	case block["Folder"] == "+":
		entry.Kind = KindDir
	case len(attrs) > 1 && len(attrs[1]) == 10:
		entry.Kind = kindFromMode(attrs[1])
	case len(attrs) > 0 && strings.HasPrefix(attrs[0], "D"):
		entry.Kind = KindDir
	}
	if link := block["Symbolic Link"]; link != "" {
		entry.Kind = KindSymlink
		entry.Link = link
	}
	return entry
}

// Inspect rejects archives that are encrypted, empty, or contain members
// that could escape the extraction folder, and summarises the rest.
func Inspect(entries []Entry) (Summary, error) {
	for _, entry := range entries {
		if entry.Encrypted {
			return Summary{}, ErrEncrypted
		}
	}

	names := make([]string, 0, len(entries))
	symlinks := map[string]bool{}
	for _, entry := range entries {
		if entry.Kind == KindSymlink {
			if n, err := safeName(entry.Name); err == nil && n != "" {
				symlinks[n] = true
			}
		}
	}
	seen := map[string]int{}
	top := map[string]bool{}
	var total int64
	for _, entry := range entries {
		name, err := safeName(entry.Name)
		if err != nil {
			return Summary{}, err
		}
		if name == "" {
			continue // the archive root, e.g. "./"
		}
		switch entry.Kind {
		case KindOther:
			return Summary{}, &UnsafeError{Name: entry.Name, Reason: "is a device or special file"}
		case KindSymlink:
			if escapes(name, entry.Link) || throughSymlink(name, entry.Link, symlinks) {
				return Summary{}, &UnsafeError{Name: entry.Name, Reason: "links outside the extraction folder"}
			}
		case KindHardlink:
			if _, err := safeName(entry.Link); err != nil {
				return Summary{}, &UnsafeError{Name: entry.Name, Reason: "links outside the extraction folder"}
			}
		}
		names = append(names, name)
		seen[name]++
		top[strings.SplitN(name, "/", 2)[0]] = true
		total += entry.Size
	}
	if len(names) == 0 {
		return Summary{}, ErrEmpty
	}

	for _, name := range names {
		if len(symlinks) == 0 {
			break
		}
		if symlinks[name] && seen[name] > 1 {
			return Summary{}, &UnsafeError{Name: name, Reason: "replaces a symbolic link"}
		}
		for i := 0; i < len(name); i++ {
			if name[i] == '/' && symlinks[name[:i]] {
				return Summary{}, &UnsafeError{Name: name, Reason: "is written through a symbolic link"}
			}
		}
	}

	topLevel := make([]string, 0, len(top))
	for name := range top {
		topLevel = append(topLevel, name)
	}
	sort.Strings(topLevel)
	return Summary{Entries: len(names), TotalSize: total, TopLevel: topLevel}, nil
}

var windowsDrive = regexp.MustCompile(`^[A-Za-z]:[\\/]`)

// safeName normalises an archive member name, rejecting absolute paths and
// ".." components. Backslashes count as separators because unzip treats
// them that way for archives made on Windows.
func safeName(raw string) (string, error) {
	if strings.ContainsRune(raw, 0) {
		return "", &UnsafeError{Name: raw, Reason: "has an invalid name"}
	}
	if strings.HasPrefix(raw, "/") || strings.HasPrefix(raw, `\`) || windowsDrive.MatchString(raw) {
		return "", &UnsafeError{Name: raw, Reason: "uses an absolute path"}
	}
	for _, part := range strings.FieldsFunc(raw, func(r rune) bool { return r == '/' || r == '\\' }) {
		if part == ".." {
			return "", &UnsafeError{Name: raw, Reason: "points outside the extraction folder"}
		}
	}
	name := path.Clean(raw)
	if name == "." {
		return "", nil
	}
	return name, nil
}

// escapes reports whether a symlink at name pointing to target would resolve
// outside the extraction folder. Unknown targets (zip) are checked elsewhere.
func escapes(name, target string) bool {
	if target == "" {
		return false
	}
	if strings.HasPrefix(target, "/") {
		return true
	}
	resolved := path.Join(path.Dir(name), target)
	return resolved == ".." || strings.HasPrefix(resolved, "../")
}

// throughSymlink reports whether resolving target walks through another archived symlink before
// its last component. The lexical check in escapes() cannot see where that detour leads, as in
// "sub/up -> .." followed by "x -> sub/up/../..".
func throughSymlink(name, target string, symlinks map[string]bool) bool {
	cur := path.Dir(name)
	parts := strings.Split(target, "/")
	for i, part := range parts {
		switch part {
		case "", ".":
			continue
		case "..":
			cur = path.Dir(cur)
		default:
			cur = path.Join(cur, part)
			if i < len(parts)-1 && symlinks[cur] {
				return true
			}
		}
	}
	return false
}

func kindFromMode(mode string) EntryKind {
	if mode == "" {
		return KindFile
	}
	switch mode[0] {
	case '-':
		return KindFile
	case 'd':
		return KindDir
	case 'l':
		return KindSymlink
	case 'h':
		return KindHardlink
	case '?':
		return KindFile
	default:
		return KindOther
	}
}

// splitFields returns the first n whitespace-separated fields and the rest of
// the line, which may itself contain spaces (file names).
func splitFields(line string, n int) ([]string, string) {
	fields := make([]string, 0, n)
	rest := line
	for len(fields) < n {
		rest = strings.TrimLeft(rest, " \t")
		if rest == "" {
			return fields, ""
		}
		end := strings.IndexAny(rest, " \t")
		if end < 0 {
			fields = append(fields, rest)
			return fields, ""
		}
		fields = append(fields, rest[:end])
		rest = rest[end:]
	}
	return fields, strings.TrimLeft(rest, " \t")
}
