import json
import os
import sys
import requests
import time

# stdout を UTF-8 で即座にフラッシュ
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
sys.stderr.reconfigure(encoding='utf-8')

# --- 設定 ---
OPENAI_API_KEY = "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"
DATA_JSON_PATH = "data.json"
IMG_OUTPUT_DIR = "img"

API_TIMEOUT = 120
DOWNLOAD_TIMEOUT = 60
MAX_RETRIES = 3
RETRY_WAIT = 10

def generate_image(word_name, word_category, filename):
    url = "https://api.openai.com/v1/images/generations"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENAI_API_KEY}"
    }
    
    style_prompt = (
        f"A very high-quality, clear, and realistic illustration of '{word_name}' (category: {word_category}). "
        "Suitable for a Japanese kindergarten entrance exam study material. "
        "White background. "
        "ABSOLUTELY NO TEXT, NO LETTERS, NO CHARACTERS, NO WORDS, NO NUMBERS, NO WRITING of any kind anywhere in the image. "
        "Style: professional educational picture book watercolor illustration. "
        "The illustration must clearly and unmistakably depict the subject so a 5-year-old child can identify what it is."
    )
    
    payload = {
        "model": "dall-e-3",
        "prompt": style_prompt,
        "n": 1,
        "size": "1024x1024",
        "quality": "standard"
    }
    
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            print(f"  [{filename}] リクエスト中... (試行 {attempt}/{MAX_RETRIES})")
            response = requests.post(url, headers=headers, json=payload, timeout=API_TIMEOUT)
            response.raise_for_status()
            
            image_url = response.json()['data'][0]['url']
            img_data = requests.get(image_url, timeout=DOWNLOAD_TIMEOUT).content
            
            with open(os.path.join(IMG_OUTPUT_DIR, filename), 'wb') as handler:
                handler.write(img_data)
                
            print(f"  [OK] [{filename}] 保存完了!")
            return True
            
        except requests.exceptions.Timeout:
            print(f"  [TIMEOUT] (試行 {attempt}/{MAX_RETRIES})")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_WAIT)
                
        except requests.exceptions.HTTPError as e:
            status_code = e.response.status_code if e.response else 0
            error_body = ""
            try:
                error_body = e.response.json().get('error', {}).get('message', '')
            except:
                pass
            print(f"  [HTTP {status_code}] {error_body} (試行 {attempt}/{MAX_RETRIES})")
            
            if status_code == 429:
                print(f"  -> レートリミット! 30秒待機...")
                time.sleep(30)
            elif status_code == 400 and 'billing' in error_body.lower():
                print(f"  [FATAL] クレジット不足です。スクリプトを停止します。")
                sys.exit(1)
            elif status_code == 400:
                print(f"  -> Bad Request。スキップします。")
                return False
            elif attempt < MAX_RETRIES:
                time.sleep(RETRY_WAIT)
                
        except Exception as e:
            print(f"  [ERROR] {e} (試行 {attempt}/{MAX_RETRIES})")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_WAIT)
    
    print(f"  [FAIL] [{filename}] スキップ")
    return False

def main():
    if not os.path.exists(IMG_OUTPUT_DIR):
        os.makedirs(IMG_OUTPUT_DIR)

    with open(DATA_JSON_PATH, 'r', encoding='utf-8') as f:
        words = json.load(f)

    existing = set(os.listdir(IMG_OUTPUT_DIR))
    missing = [w for w in words if w.get('image') not in existing]
    total = len(words)
    
    print(f"=== DALL-E 3 画像生成スクリプト ===")
    print(f"合計: {total} 個 / 既存: {total - len(missing)} 枚 / 残り: {len(missing)} 枚")
    
    if len(missing) == 0:
        print("全ての画像が揃っています!")
        return
    
    print(f"\n生成開始...\n")
    
    success = 0
    fail = 0
    
    for i, w in enumerate(missing):
        filename = w.get('image', f"{w['id']:03d}_{w['reading']}.png")
        print(f"\n--- [{i+1}/{len(missing)}] {w['name']} ({w.get('category','')}) ---")
        
        if generate_image(w['name'], w.get('category', ''), filename):
            success += 1
        else:
            fail += 1
        
        time.sleep(2)
        
        if (success + fail) % 10 == 0 and (success + fail) > 0:
            with open(DATA_JSON_PATH, 'w', encoding='utf-8') as f:
                json.dump(words, f, ensure_ascii=False, indent=2)
            elapsed = success + fail
            print(f"\n  [中間保存] {elapsed}枚処理済み (成功:{success} / 失敗:{fail})\n")

    with open(DATA_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(words, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*50}")
    print(f"完了! 成功: {success} / 失敗: {fail}")
    print(f"{'='*50}")

if __name__ == "__main__":
    main()
