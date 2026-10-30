package filesystem

import (
	"path"
	"strings"
	"unicode/utf8"
)

func MIME(filename string) string {
	ext := strings.ToLower(strings.TrimPrefix(path.Ext(filename), "."))
	if mime, ok := mimeByExt[ext]; ok {
		return mime
	}
	base := strings.ToLower(path.Base(filename))
	if mime, ok := mimeByName[base]; ok {
		return mime
	}
	return "application/octet-stream"
}

func DetectMIME(filename string, sample []byte) string {
	mime := MIME(filename)
	if mime != "application/octet-stream" {
		return mime
	}
	if LooksLikeText(sample) {
		return "text/plain"
	}
	return mime
}

func LooksLikeText(sample []byte) bool {
	if len(sample) == 0 {
		return true
	}
	if !utf8.Valid(sample) {
		return false
	}
	nonPrintable := 0
	for _, b := range sample {
		if b == 0 {
			return false
		}
		if b < 9 || (b > 13 && b < 32) {
			nonPrintable++
		}
	}
	return nonPrintable*100/len(sample) < 8
}

// activeTypes can run script or load resources when a browser renders them, so they are never
// shown inline from the API origin. SVG still works in an <img>, which ignores the disposition.
var activeTypes = map[string]bool{
	"text/html":              true,
	"application/xhtml+xml":  true,
	"text/xml":               true,
	"application/xml":        true,
	"image/svg+xml":          true,
	"text/javascript":        true,
	"application/javascript": true,
	"text/css":               true,
}

func Inline(mime string) bool {
	if activeTypes[mime] {
		return false
	}
	return PassiveMedia(mime) ||
		strings.HasPrefix(mime, "text/") ||
		mime == "application/json"
}

// PassiveMedia is content a browser renders without executing script (images other than SVG,
// audio, video and PDF).
func PassiveMedia(mime string) bool {
	if activeTypes[mime] {
		return false
	}
	return strings.HasPrefix(mime, "image/") ||
		strings.HasPrefix(mime, "video/") ||
		strings.HasPrefix(mime, "audio/") ||
		mime == "application/pdf"
}

var mimeByExt = map[string]string{
	"jpg":  "image/jpeg",
	"jpeg": "image/jpeg",
	"png":  "image/png",
	"gif":  "image/gif",
	"webp": "image/webp",
	"svg":  "image/svg+xml",
	"bmp":  "image/bmp",
	"avif": "image/avif",
	"ico":  "image/x-icon",
	"mp4":  "video/mp4",
	"webm": "video/webm",
	"ogv":  "video/ogg",
	"ogg":  "audio/ogg",
	"mov":  "video/quicktime",
	"m4v":  "video/x-m4v",
	"mp3":  "audio/mpeg",
	"wav":  "audio/wav",
	"m4a":  "audio/mp4",
	"aac":  "audio/aac",
	"flac": "audio/flac",
	"pdf":  "application/pdf",
	"txt":  "text/plain",
	"log":  "text/plain",
	"csv":  "text/csv",
	"md":   "text/markdown",
	"json": "application/json",
	"yaml": "text/yaml",
	"yml":  "text/yaml",
	"xml":  "application/xml",
	"html": "text/html",
	"css":  "text/css",
	"js":   "text/javascript",
	"ts":   "text/plain",
	"tsx":  "text/plain",
	"jsx":  "text/javascript",
	"go":   "text/plain",
	"py":   "text/x-python",
	"rs":   "text/plain",
	"sh":   "text/x-shellscript",
	"bash": "text/x-shellscript",
	"zsh":  "text/x-shellscript",
	"c":    "text/x-c",
	"h":    "text/x-c",
	"cpp":  "text/x-c",
	"hpp":  "text/x-c",
	"java": "text/x-java-source",
	"sql":  "application/sql",
	"ini":  "text/plain",
	"conf": "text/plain",
	"cfg":  "text/plain",
	"toml": "text/plain",
	"env":  "text/plain",
	"zip":  "application/zip",
	"gz":   "application/gzip",
	"tar":  "application/x-tar",
	"tgz":  "application/gzip",
}

var mimeByName = map[string]string{
	"hostname":       "text/plain",
	"hosts":          "text/plain",
	"passwd":         "text/plain",
	"group":          "text/plain",
	"shadow":         "text/plain",
	"fstab":          "text/plain",
	"motd":           "text/plain",
	"issue":          "text/plain",
	"profile":        "text/plain",
	"environment":    "text/plain",
	"shells":         "text/plain",
	"services":       "text/plain",
	"protocols":      "text/plain",
	"networks":       "text/plain",
	"crontab":        "text/plain",
	"sudoers":        "text/plain",
	"os-release":     "text/plain",
	"machine-id":     "text/plain",
	"debian_version": "text/plain",
	"dockerfile":     "text/x-dockerfile",
	"makefile":       "text/x-makefile",
}
