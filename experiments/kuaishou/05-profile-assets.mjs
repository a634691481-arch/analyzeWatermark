import fs from 'node:fs'

const h = fs.readFileSync(new URL('./_profile.html', import.meta.url), 'utf8')
const js = new Set()
let m
for (const re of [/https:\/\/[^"'\s]+\.js/g, /src="([^"]+\.js)"/g]) {
  while ((m = re.exec(h))) js.add(m[0])
}
console.log([...js].join('\n'))
console.log('--- markers ---')
for (const w of ['INIT_STATE', 'window.__', 'id="app"', 'profile']) {
  console.log(w, h.indexOf(w))
}
