<div dir="rtl">

# REST API — Read Endpoints — Design Spec

## מטרה

לסגור את הפריט הפתוח היחיד ב-checklist (`README.md`, `SPEC.md`): REST API
עם API Key Auth לקריאת תוצאות, בנוסף ל-`POST /api/upload` הקיים. שני
endpoints חדשים, לקריאה בלבד:

- `GET /api/documents` — רשימת כל המסמכים + החילוץ שלהם (אם קיים).
- `GET /api/documents/:id` — מסמך בודד + החילוץ שלו.

## Endpoints

**`GET /api/documents`**
- Auth: `X-API-Key` (זהה ל-`/api/upload`).
- מחזיר `DocumentRow[]` (הטיפוס הקיים ב-`lib/supabase.ts`), ללא סינון/pagination —
  אותו שאילתה בדיוק שמזין כיום את הדשבורד (`listDocumentsWithExtractions`).
  `200` עם מערך (ריק אם אין מסמכים).

**`GET /api/documents/:id`**
- Auth: `X-API-Key`.
- `200` עם `DocumentRow` בודד; `404` אם ה-id לא קיים.

## מימוש

1. **`lib/supabase.ts`** — הוצאת מיפוי שורה→`DocumentRow` מתוך
   `listDocumentsWithExtractions` לפונקציית עזר פרטית משותפת (כרגע הלוגיקה
   הזו כפולה בין הפונקציה הקיימת לפונקציה החדשה אם לא מוצאת). הוספת:
   ```ts
   export async function getDocumentWithExtraction(
     client: SupabaseClient,
     id: string
   ): Promise<DocumentRow | null>
   ```
   שאילתה יחידה עם `.eq("id", id)`, מחזירה `null` אם אין שורה תואמת (לא
   `throw`) — כדי שה-route יוכל להבחין בין "לא נמצא" (404) ל"שגיאת Supabase"
   (503).

2. **`lib/require-api-key.ts`** (חדש) — הוצאת בדיקת ה-auth שכיום מוטמעת
   ב-`/api/upload` לפונקציה משותפת, כדי שלא תוכפל פעם שלישית/רביעית:
   ```ts
   export function requireApiKey(request: Request, env: { DOCUMENTS_API_KEY: string }): Response | null
   ```
   מחזירה `Response` (401) אם המפתח חסר/שגוי — כולל השמירה הקיימת מפני
   `DOCUMENTS_API_KEY` ריק שהופך את הבדיקה ל-bypass — או `null` אם תקין.
   `app/api/upload/route.ts` עובר להשתמש בה גם הוא (dedup, לא רק לצורך
   ה-endpoints החדשים).

3. **`app/api/documents/route.ts`** (חדש) — `GET`: `requireApiKey` → קריאה
   ל-`listDocumentsWithExtractions` → `Response.json(documents)`. שגיאת
   Supabase → `503`.

4. **`app/api/documents/[id]/route.ts`** (חדש) — `GET`: `requireApiKey` →
   קריאה ל-`getDocumentWithExtraction` → `404` אם `null`, אחרת `200` עם
   ה-`DocumentRow`. שגיאת Supabase → `503`.

## החלטות עיצוב

1. **ללא סינון/pagination** — לפי בחירה מפורשת: ה-endpoint מחזיר את כל
   הרשימה, זהה למה שהדשבורד כבר שולף. אפשר להוסיף `?status=`/`?min_confidence=`
   בעתיד אם יופיע צורך אמיתי מצד צרכן חיצוני.
2. **`requireApiKey` משותף** — מוצדק כי הבדיקה (כולל שמירת ה-empty-string)
   תהיה כעת בשלושה מקומות זהים לחלוטין; לא הפשטה מוקדמת.
3. **`getDocumentWithExtraction` מחזירה `null` ולא זורקת** על "לא נמצא" —
   מבדיל במפורש בין 404 (קלט לא תקין) ל-503 (תקלת שירות), כמו שאר ה-routes
   בפרויקט מבדילים היום.
4. **בלי redaction נוספת בתגובה** — `extractions` כבר לא מכילה שם אמיתי/ת.ז
   (הזהות האמיתית ב-`student_identity_map` בלבד, שאין אליה גישה מה-routes
   האלה כלל) — עומד בדרישת האבטחה הקיימת ללא שינוי.

## בדיקות

תואם למוסכמה הקיימת בקוד: פונקציות דקות שרק עוטפות קריאת Supabase
(`listDocumentsWithExtractions`, וכעת `getDocumentWithExtraction`) אינן
מקבלות unit test ישיר — הן פונקציות thin wrapper, כמו הקיימות היום. `requireApiKey`
לעומת זאת היא פונקציה טהורה (קלט: request+env בדויים, פלט: `Response | null`)
ומקבלת `lib/require-api-key.test.ts` — מקרי בדיקה: מפתח נכון (`null`), מפתח
שגוי (401), header חסר (401), `DOCUMENTS_API_KEY` ריק (401, לא bypass).

## מה בכוונה נשאר מחוץ להיקף

- אין סינון/pagination ב-`GET /api/documents` (ראו החלטה 1).
- אין endpoints לכתיבה/מחיקה חדשים — אלה כבר קיימים (`POST /api/upload`,
  מחיקת מסמך מהדשבורד).
- אין שינוי בסכימת התגובה מול מה שהדשבורד כבר צורך (`DocumentRow`) — אין
  צורך ב-DTO נפרד לצרכן ה-REST.

</div>
