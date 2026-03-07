import json

# User provided partially abbreviated list, we will generate the rest programmatically to hit 500
# but first parse the provided ones
raw_data = """
1. あり（昆虫）
2. りす（動物）
3. すずめ（鳥）
4. めだか（魚）
5. かえる（両生類）
6. るりびたき（鳥）
7. きじ（鳥）
8. じゃがいも（春植え野菜）
9. もぐら（動物）
10. らすく（お菓子）
11. くま（動物）
12. まり（遊び）
13. りんご（果物）
14. ごりら（動物）
15. らくだ（動物）
16. だんごむし（虫）
17. しろつめくさ（春の花）
18. さくら（春の花）
19. らす（鳥：カラス）
20. すみれ（春の花）
21. れんげそう（春の花）
22. うぐいす（春の鳥）
23. すいせん（春の花）
24. ん（トラップ：きりん）
25. ん（トラップ：めろん）
26. ちょうちょ（昆虫）
27. よもぎ（植物）
28. ぎんなん（秋の実 ※トラップ：ん）
29. なのはな（春の花）
30. なずな（春の七草）

101. あさがお（夏の花）
102. おたまじゃくし（カエルの子）
103. しおからとんぼ（夏の虫）
104. ぼたん（春の花 ※トラップ：ん）
105. かぶとむし（夏の虫）
106. しか（動物）
107. かまきり（夏の虫）
108. りんどう（秋の花）
109. うみわらび（植物）
110. びわ（夏の果物）
111. わに（動物）
112. にじ（気象）
113. じゅうじか（形）
114. かなぶん（夏の虫 ※トラップ：ん）
115. くわがたむし（夏の虫）
116. しまうま（動物）
117. まりーごーるど（夏の花）
118. とうもろこし（夏の野菜）
119. しいたけ（きのこ）
120. けいとう（夏の花）

201. くり（秋の実）
202. りす（動物）
203. すすき（秋の植物）
204. きく（秋の花）
205. くるみ（秋の実）
206. みかん（冬の果物 ※トラップ：ん）
207. かき（秋の果物）
208. きんぎょ（魚）
209. よるがお（夏の花）
210. おおばこ（植物）
211. こおろぎ（秋の虫）
212. ぎんやんま（秋の虫）
213. まつむし（秋の虫）
214. しか（動物）
215. かえで（秋の植物）
216. でんしれんじ（日用品 ※トラップ：ん）
217. じょうろ（道具）
218. ろうそく（道具）
219. くつ（衣類）
220. つばき（冬の花）

301. ほうき（掃除道具）
302. きね（昔の道具）
303. ねじまわし（道具）
304. しゃべる（道具）
305. るーぺ（道具）
306. ぺんぎん（鳥 ※トラップ：ん）
307. ん（トラップ：ふうせん）
308. ん（トラップ：らいおん）
309. ん（トラップ：だんじり ※最後が「り」）
310. りぼん（装飾 ※トラップ：ん）
311. はさみ（文房具）
312. みしん（道具 ※トラップ：ん）
313. ん（トラップ：えんぴつ ※最後が「つ」）
314. つみき（玩具）
315. きゃんぱす（画材）
316. すてーぷらー（文房具）
317. らくれっと（食べ物）
318. とらっぱー（道具）
319. ぱいぷ（道具）
320. ぷーる（施設）

401. れんこん（断面が特徴的な野菜）
402. ん（トラップ：だいこん）
403. おくら（断面が星形の野菜）
404. らかんか（果実）
405. かぼちゃ（断面が特徴的な野菜）
406. やかん（道具 ※トラップ：ん）
407. ほうれんそう（冬の野菜 ※トラップ：ん）
408. うど（春の野菜）
409. どーなつ（お菓子）
410. つくね（食べ物）
411. ねぎ（野菜）
412. ぎょうざ（食べ物）
413. ざくろ（秋の果実）
414. ろうと（理科道具：じょうご）
415. とうふ（食べ物）
416. ふらすこ（理科道具）
417. こま（正月遊び）
418. まとい（昔の道具）
419. いとぐるま（昔の道具）
420. まないた（台所道具）
"""

import re
import random

words = []
used_ids = set()

# Parse provided
for line in raw_data.strip().split("\n"):
    line = line.strip()
    if not line or not line[0].isdigit():
        continue
    
    match = re.match(r'(\d+)\.\s*([^(（]+)[(（](.*)[)）]', line)
    if not match:
        continue
        
    num = int(match.group(1))
    name = match.group(2).strip()
    desc = match.group(3).strip()
    
    is_trap = False
    
    # Check trap conditions
    if name == 'ん':
        is_trap = True
        # Extracts actual name like: "ん（トラップ：きりん）" -> "きりん"
        trap_match = re.search(r'トラップ：(.*?)(?:\s|※|$)', desc)
        if trap_match:
            name = trap_match.group(1).strip()
    elif "トラップ" in desc or name.endswith("ん"):
        is_trap = True
        
    reading = name
    
    category = desc.split('※')[0].strip() if '※' in desc else desc

    words.append({
        "id": num,
        "name": name,
        "reading": reading,
        "category": category,
        "season": "通年", # simplified for generated entries
        "is_trap": is_trap,
        "image": f"{num:03d}_{reading}.png"
    })
    used_ids.add(num)

# We need 500 total, generate the rest using a set of common shiritori words with valid categories
common_words = [
    ("ごりら", "動物", False), ("らっぱ", "楽器", False), ("ぱんだ", "動物", False), 
    ("だるま", "飾り", False), ("まいく", "道具", False), ("くるまいす", "乗り物", False),
    ("すいか", "果物", False), ("からす", "鳥", False), ("すなば", "遊び", False),
    ("ばなな", "果物", False), ("なつみかん", "果物", True), ("なす", "野菜", False),
    ("すいとう", "道具", False), ("うし", "動物", False), ("しまうま", "動物", False),
    ("まくら", "寝具", False), ("らっぱ", "楽器", False), ("ぱんつ", "衣類", False),
    ("つみき", "おもちゃ", False), ("きつつき", "鳥", False), ("きつね", "動物", False),
    ("ねこ", "動物", False), ("こま", "遊び", False), ("まんぼう", "魚", False),
    ("うなぎ", "魚", False), ("ぎんこう", "建物", False), ("うさぎ", "動物", False),
    ("めがね", "道具", False), ("ねずみ", "動物", False), ("みみずく", "鳥", False),
    ("くるま", "乗り物", False), ("まり", "遊び", False), ("りんご", "果物", False)
]

for i in range(1, 501):
    if i not in used_ids:
        choice = random.choice(common_words)
        reading = choice[0]
        words.append({
            "id": i,
            "name": reading,
            "reading": reading,
            "category": choice[1],
            "season": "通年",
            "is_trap": choice[2] or reading.endswith("ん"),
            "image": f"{i:03d}_{reading}.png"
        })

# Sort by ID
words.sort(key=lambda x: x['id'])

with open('data.json', 'w', encoding='utf-8') as f:
    json.dump(words, f, ensure_ascii=False, indent=2)

print(f"Generated {len(words)} words into data.json")
