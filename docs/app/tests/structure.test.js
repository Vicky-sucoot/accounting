// 檢查拆分後的檔案都有被載入與離線快取，避免新增檔案時漏掉。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const jsFiles = fs.readdirSync(path.join(APP, 'js')).filter(f => f.endsWith('.js')).sort();
const index = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(APP, 'sw.js'), 'utf8');

test('js/ 每個檔案都在 index.html 載入，且 core 最先、main 最後', () => {
  const order = [...index.matchAll(/<script src="js\/([\w-]+\.js)"><\/script>/g)].map(m => m[1]);
  assert.deepEqual([...order].sort(), jsFiles);
  assert.equal(order[0], 'core.js');
  assert.equal(order[order.length - 1], 'main.js');
});

test('js/ 每個檔案都在 Service Worker 離線快取清單中', () => {
  for (const f of jsFiles) assert.ok(sw.includes("'./js/" + f + "'"), f + ' 不在 sw.js 的快取清單');
});

test('各檔案沒有重複宣告同名的全域函式或常數', () => {
  const seen = new Map();
  for (const f of jsFiles) {
    const src = fs.readFileSync(path.join(APP, 'js', f), 'utf8');
    for (const m of src.matchAll(/^(?:async )?function ([\w$]+)|^(?:const|let) ([\w$]+)/gm)) {
      const name = m[1] || m[2];
      assert.ok(!seen.has(name), name + ' 同時宣告在 ' + seen.get(name) + ' 與 ' + f);
      seen.set(name, f);
    }
  }
});
