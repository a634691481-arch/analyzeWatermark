/** 校验品牌图标在 simple-icons 里是否存在 */
import { readFileSync } from 'node:fs'

const collection = JSON.parse(readFileSync('node_modules/@iconify-json/simple-icons/icons.json', 'utf8'))
const all = new Set(Object.keys(collection.icons ?? {}))
console.log('simple-icons 图标总数:', all.size)

const want = ['bilibili', 'tiktok', 'douyin', 'xiaohongshu', 'rednote', 'weibo', 'kuaishou', 'alibabacloud', 'alibaba', 'qwen', 'bytedance', 'douban']
for (const name of want) {
  console.log('  ' + (name + ':').padEnd(18), all.has(name) ? '有' : '无')
}

console.log('\n关键字候选:')
for (const keyword of ['dou', 'xiaohong', 'qwen', 'tongyi', 'rednote', 'bili', 'kuaishou', 'weibo']) {
  const hits = [...all].filter(item => item.includes(keyword)).slice(0, 10)
  console.log('  ' + keyword.padEnd(10), hits.join(', ') || '(无)')
}
