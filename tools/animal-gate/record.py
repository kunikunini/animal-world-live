# 使い方: python3 tools/animal-gate/record.py <spec.json>
# 1 体分の記録を LOG.md・SOURCE.md（日本語の節と英語の 1 文）・DEVLOG.md に足す。.gitignore に public/models の例外を足す
import json, sys
d = json.load(open(sys.argv[1]))
def add_after(p, anchor, text, last=True):
    s = open(p).read(); i = s.rfind(anchor) if last else s.find(anchor); assert i >= 0, (p, anchor)
    s = s[:i + len(anchor)] + text + s[i + len(anchor):]; open(p, 'w').write(s)
log = 'experiments/animals-night/LOG.md'
s = open(log).read().rstrip('\n') + '\n\n' + d['log'].strip('\n') + '\n'; open(log, 'w').write(s)
src = 'public/models/SOURCE.md'; s = open(src).read()
o = '## Source of `public/models` (English)'; assert s.count(o) == 1
s = s.replace(o, d['source'].strip('\n') + '\n\n' + o).rstrip('\n') + ' ' + d['english'] + '\n'; open(src, 'w').write(s)
dv = 'DEVLOG.md'; s = open(dv).read(); a = '## 2026-11-06 夜 動物の 3D 夜間バッチ'
i = s.find(a); j = s.find('\n## ', i + 5); j = len(s) if j < 0 else j
s = s[:j].rstrip('\n') + '\n' + d['devlog'].strip('\n') + '\n' + s[j:]; open(dv, 'w').write(s)
gi = '.gitignore'; s = open(gi).read(); line = '!public/models/' + d['file'] + '.glb'
if line not in s:
    prev = '!public/models/capybara-maro.glb'; assert prev in s
    k = s.rfind('!public/models/'); e = s.find('\n', k); s = s[:e + 1] + line + '\n' + s[e + 1:]; open(gi, 'w').write(s)
print('ok')
