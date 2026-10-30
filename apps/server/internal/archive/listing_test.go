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

func TestParseTarListingRejectsShiftedColumns(t *testing.T) {
	// A tar header can carry an owner name with spaces; GNU tar prints it raw, which shifts
	// every column. The listing must be refused, not mis-parsed (symlink name "-> /abs").
	out := "lrwxrwxrwx a b c/g 0 2024-01-01 00:00 n -> /etc\n-rw-r--r-- a b c/g 3 2024-01-01 00:00 n/y z\n"
	if _, err := ParseTarListing(out); err == nil {
		t.Fatal("shifted columns must be rejected")
	}
	// A symlink line without its target cannot be vetted.
	if _, err := ParseTarListing("lrwxrwxrwx root/root 0 2024-01-01 00:00 lonely\n"); err == nil {
		t.Fatal("symlink without target must be rejected")
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
