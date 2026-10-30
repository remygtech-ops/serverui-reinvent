package archive

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestParseTarListingGNU(t *testing.T) {
	out := `drwxr-xr-x deploy/deploy     0 2026-10-01 12:00 site/
-rw-r--r-- deploy/deploy    12 2026-10-01 12:00 site/index.html
lrwxrwxrwx deploy/deploy     0 2026-10-01 12:00 site/current -> index.html
hrw-r--r-- deploy/deploy     0 2026-10-01 12:00 site/copy.html link to site/index.html
-rw-r--r-- deploy/deploy     5 2026-10-01 12:00 site/my notes.txt
`
	entries, err := ParseTarListing(out)
	if err != nil {
		t.Fatal(err)
	}
	want := []Entry{
		{Name: "site/", Kind: KindDir},
		{Name: "site/index.html", Kind: KindFile, Size: 12},
		{Name: "site/current", Kind: KindSymlink, Link: "index.html"},
		{Name: "site/copy.html", Kind: KindHardlink, Link: "site/index.html"},
		{Name: "site/my notes.txt", Kind: KindFile, Size: 5},
	}
	if !reflect.DeepEqual(entries, want) {
		t.Fatalf("got %+v\nwant %+v", entries, want)
	}
}

func TestParseTarListingBusyBoxAndBSD(t *testing.T) {
	busybox := "-rw-r--r-- 0/0        12 2026-10-01 12:00:00 site/index.html\n"
	bsd := `drwxr-xr-x  0 deploy staff       0 Oct  1 12:00 site/
lrwxr-xr-x  0 deploy staff       0 Oct  1  2025 site/current -> /etc
`
	got, err := ParseTarListing(busybox)
	if err != nil || len(got) != 1 || got[0].Name != "site/index.html" || got[0].Size != 12 {
		t.Fatalf("busybox: %+v %v", got, err)
	}
	got, err = ParseTarListing(bsd)
	if err != nil || len(got) != 2 {
		t.Fatalf("bsd: %+v %v", got, err)
	}
	if got[1].Kind != KindSymlink || got[1].Name != "site/current" || got[1].Link != "/etc" {
		t.Fatalf("bsd symlink: %+v", got[1])
	}
}

func TestParseTarListingRejectsGarbage(t *testing.T) {
	if _, err := ParseTarListing("not a listing\n"); err == nil {
		t.Fatal("expected error")
	}
}

func TestParseTarListingMarksDevices(t *testing.T) {
	entries, err := ParseTarListing("brw-rw---- root/disk 8,1 2026-10-01 12:00 dev/sda1\n")
	if err != nil || len(entries) != 1 || entries[0].Kind != KindOther {
		t.Fatalf("got %+v %v", entries, err)
	}
}

func TestParseZipListing(t *testing.T) {
	out := `Archive:  /srv/site.zip
Zip file size: 512 bytes, number of entries: 3
drwxr-xr-x  3.0 unx        0 bx stor 26-Oct-01 12:00 site/
-rw-r--r--  3.0 unx       12 tx defN 26-Oct-01 12:00 site/my page.html
-rw-r--r--  3.0 unx        5 TX defN 26-Oct-01 12:00 site/secret.txt
3 files, 17 bytes uncompressed, 15 bytes compressed:  11.8%
`
	entries, err := ParseZipListing(out)
	if err != nil {
		t.Fatal(err)
	}
	want := []Entry{
		{Name: "site/", Kind: KindDir},
		{Name: "site/my page.html", Kind: KindFile, Size: 12},
		{Name: "site/secret.txt", Kind: KindFile, Size: 5, Encrypted: true},
	}
	if !reflect.DeepEqual(entries, want) {
		t.Fatalf("got %+v\nwant %+v", entries, want)
	}
}

func TestParse7zListing(t *testing.T) {
	out := `7-Zip [64] 16.02 : Copyright (c) 1999-2016 Igor Pavlov

Listing archive: /srv/site.7z

--
Path = /srv/site.7z
Type = 7z

----------
Path = site
Size = 0
Folder = +
Attributes = D_ drwxr-xr-x
Encrypted = -

Path = site/index.html
Size = 12
Folder = -
Attributes = A_ -rw-r--r--
Encrypted = -

Path = site/latest
Size = 10
Folder = -
Attributes = A_ lrwxrwxrwx
Encrypted = +
`
	entries, err := Parse7zListing(out)
	if err != nil {
		t.Fatal(err)
	}
	want := []Entry{
		{Name: "site", Kind: KindDir},
		{Name: "site/index.html", Kind: KindFile, Size: 12},
		{Name: "site/latest", Kind: KindSymlink, Size: 10, Encrypted: true},
	}
	if !reflect.DeepEqual(entries, want) {
		t.Fatalf("got %+v\nwant %+v", entries, want)
	}
	if _, err := Parse7zListing("7-Zip\nError: cannot open\n"); err == nil {
		t.Fatal("expected error without member separator")
	}
}

func TestInspectSummarises(t *testing.T) {
	summary, err := Inspect([]Entry{
		{Name: "./", Kind: KindDir},
		{Name: "./site/", Kind: KindDir},
		{Name: "./site/index.html", Kind: KindFile, Size: 12},
		{Name: "site/link", Kind: KindSymlink, Link: "../site/index.html"},
		{Name: "README", Kind: KindFile, Size: 3},
	})
	if err != nil {
		t.Fatal(err)
	}
	want := Summary{Entries: 4, TotalSize: 15, TopLevel: []string{"README", "site"}}
	if !reflect.DeepEqual(summary, want) {
		t.Fatalf("got %+v want %+v", summary, want)
	}
}

func TestInspectRejectsUnsafeEntries(t *testing.T) {
	cases := map[string][]Entry{
		"absolute path":          {{Name: "/etc/passwd"}},
		"dot dot":                {{Name: "../evil.sh"}},
		"nested dot dot":         {{Name: "site/../../evil.sh"}},
		"windows dot dot":        {{Name: `site\..\..\evil.sh`}},
		"windows drive":          {{Name: `C:\evil.sh`}},
		"absolute symlink":       {{Name: "etc", Kind: KindSymlink, Link: "/etc"}},
		"escaping symlink":       {{Name: "site/up", Kind: KindSymlink, Link: "../../.."}},
		"escaping hardlink":      {{Name: "site/x", Kind: KindHardlink, Link: "../../etc/shadow"}},
		"write through symlink":  {{Name: "logs", Kind: KindSymlink, Link: "data"}, {Name: "logs/app.log"}},
		"symlink then same file": {{Name: "conf", Kind: KindSymlink, Link: "real"}, {Name: "conf"}},
		"device node":            {{Name: "dev/sda", Kind: KindOther}},
	}
	for name, entries := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := Inspect(entries)
			var unsafe *UnsafeError
			if !errors.As(err, &unsafe) {
				t.Fatalf("expected UnsafeError, got %v", err)
			}
		})
	}
}

func TestInspectRejectsEncryptedAndEmpty(t *testing.T) {
	if _, err := Inspect([]Entry{{Name: "a", Encrypted: true}}); !errors.Is(err, ErrEncrypted) {
		t.Fatalf("got %v", err)
	}
	if _, err := Inspect([]Entry{{Name: "./", Kind: KindDir}}); !errors.Is(err, ErrEmpty) {
		t.Fatalf("got %v", err)
	}
}

func TestUnsafeErrorTruncatesLongNames(t *testing.T) {
	err := &UnsafeError{Name: strings.Repeat("a", 500), Reason: "uses an absolute path"}
	if len(err.Error()) > 200 {
		t.Fatalf("message too long: %d", len(err.Error()))
	}
}

func TestParseTarListingOwnerAndGroupCannotShiftColumns(t *testing.T) {
	// Owner and group come from the archive. Spaces, digits and slashes in them must not change
	// where the name and the link target are read from.
	for _, owner := range []string{"a b c/g", "root/g 5", "root/a 1 2", "john doe/staff", `DOMAIN\user/Domain Users`, "x/y z/g"} {
		out := "lrwxrwxrwx " + owner + " 0 2024-01-01 00:00 sub/up -> ..\n" +
			"lrwxrwxrwx " + owner + " 0 2024-01-01 00:00 x -> sub/up/../..\n"
		entries, err := ParseTarListing(out)
		if err != nil {
			t.Fatalf("owner %q: %v", owner, err)
		}
		if len(entries) != 2 || entries[0].Name != "sub/up" || entries[0].Link != ".." ||
			entries[1].Name != "x" || entries[1].Link != "sub/up/../.." {
			t.Fatalf("owner %q was mis-parsed: %+v", owner, entries)
		}
		// The shifted layouts used to hide the first link from Inspect; now the chain is caught.
		if _, err := Inspect(entries); err == nil {
			t.Fatalf("owner %q: the symlink chain must be rejected", owner)
		}
	}
	// A symlink to an absolute path is rejected whatever the owner text is.
	entries, err := ParseTarListing("lrwxrwxrwx a b c/g 0 2024-01-01 00:00 n -> /etc\n")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Inspect(entries); err == nil {
		t.Fatal("absolute symlink must be rejected")
	}
}

func TestParseTarListingRefusesAmbiguousLines(t *testing.T) {
	for name, line := range map[string]string{
		"timestamp inside the owner": "lrwxrwxrwx root/g 5 2020-01-01 00:00 evil 0 2024-01-01 00:00 sub/up -> ..",
		"arrow inside the name":      "lrwxrwxrwx root/root 0 2024-01-01 00:00 d -> x -> /abs",
		"two link separators":        "hrw-r--r-- root/root 0 2024-01-01 00:00 a link to b link to /abs",
		"symlink without a target":   "lrwxrwxrwx root/root 0 2024-01-01 00:00 lonely",
		"no timestamp":               "lrwxrwxrwx root/root 0 sub/up -> ..",
		"control character in name":  "-rw-r--r-- root/root 3 2024-01-01 00:00 a\x01b",
		"two layouts at once":        "-rw-r--r-- 1 root root 3 Jan  1 12:00 2024-01-01 00:00 a",
	} {
		if _, err := ParseTarListing(line + "\n"); err == nil {
			t.Fatalf("%s: the line must be refused", name)
		}
	}
}

func TestParseTarListingStillReadsOrdinaryArchives(t *testing.T) {
	out := "drwxr-xr-x user/group 0 2024-01-01 00:00 src/\n" +
		"-rw-r--r-- 1000/1000 1234 2024-01-01 00:00:09 src/main.go\n" +
		"lrwxrwxrwx root/root 0 2024-01-01 00:00 src/link -> main.go\n" +
		"-rw-r--r-- 1 me staff 12 Jan  1 12:00 bsd.txt\n" +
		"crw-rw-rw- root/root 1,3 2024-01-01 00:00 dev/null\n"
	entries, err := ParseTarListing(out)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 5 || entries[1].Size != 1234 || entries[2].Link != "main.go" || entries[4].Kind != KindOther {
		t.Fatalf("%+v", entries)
	}
}

func TestInspectRejectsSymlinkChains(t *testing.T) {
	_, err := Inspect([]Entry{
		{Name: "sub/up", Kind: KindSymlink, Link: ".."},
		{Name: "x", Kind: KindSymlink, Link: "sub/up/../.."},
	})
	if err == nil {
		t.Fatal("a symlink that resolves through another symlink must be rejected")
	}
	if _, err := Inspect([]Entry{
		{Name: "lib/a", Kind: KindFile},
		{Name: "lib/b", Kind: KindSymlink, Link: "a"},
	}); err != nil {
		t.Fatalf("plain relative symlink must pass: %v", err)
	}
}
