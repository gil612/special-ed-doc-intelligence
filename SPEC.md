<div dir="rtl">

# SPEC.md — Document Intelligence Service: תוכניות חינוכיות יחידניות (תח"י)

## בחירת Domain

**נבחרה אפשרות 1 (חוזים ומסמכים משפטיים), מותאמת לתחום החינוך המיוחד.**

הנימוק: מסמך תח"י / החלטת ועדת שילוב הוא מבנית מסמך משפטי-מנהלי — יש בו צדדים
(הורים, בית ספר, רשות), תוקף בזמן, תנאים לשינוי סטטוס, ונוהל/חוק מסגרת. השדות
המקוריים הותאמו לתוכן הספציפי (ראו טבלת מיפוי בהמשך) במקום שימוש ישיר בשמות
השדות הגנריים.

| שדה מקורי (אפשרות 1) | שדה מותאם | הסבר |
|---|---|---|
| `parties` | (מפוצל ל-`disability_category`, `placement_type` וכו') | אין "צדדים" חוזיים קלאסיים; הוחלף בתוכן מהותי של ההחלטה |
| `start_date` / `end_date` | `review_date` | תאריך התוקף/העדכון הבא של התוכנית |
| `value_ils` | `weekly_support_hours` | ההיקף הכמותי המרכזי הוא שעות תמיכה, לא סכום כספי |
| `payment_terms` | — | לא רלוונטי; הושמט |
| `termination_clauses` | (חלק מ-`goals`/הערות) | תנאים לשינוי שיבוץ, אם קיימים במסמך |
| `governing_law` | — | לא נדרש בשלב זה; ניתן להוסיף כשדה עתידי (`legal_basis`) |

## Pydantic Schema

זו סכימת ה-reference (מקומית, ב-`iep_schema.py`) שעליה מבוססת הסכימה
בפועל. ב-production הסכימה מיושמת כ-Zod (TypeScript) — ראו הערת ה-runtime
ב-"זרימת המערכת" למטה — עם אותם שדות ואותם validators (דחיית `student_id`
שנראה כשם אמיתי, נרמול תאריך DD/MM/YYYY ל-ISO).

```python
from pydantic import BaseModel, Field
from datetime import date

class IEPExtraction(BaseModel):
    student_id: str | None = Field(description="מזהה תלמיד פנימי בלבד — לעולם לא שם מלא")
    school_year: str = Field(description="שנת לימודים, למשל תשפ״ז")
    disability_category: str | None = Field(description="קטגוריית הליקוי כפי שמופיע במסמך")
    placement_type: str = Field(description="הכלה מלאה / הכלה חלקית / כיתה מיוחדת / חינוך מיוחד נפרד")
    weekly_support_hours: float | None = Field(description="שעות תמיכה שבועיות שהוקצו")
    goals: list[str] = Field(description="יעדים חינוכיים/טיפוליים כפי שמופיעים בתוכנית")
    review_date: date | None = Field(description="תאריך הוועדה או עדכון התוכנית הבא")
    accommodations: list[str] = Field(description="התאמות נדרשות (בחינות, סביבה לימודית וכו׳)")
    confidence: float = Field(description="0-1 ציון ביטחון בחילוץ")
```

## מודל נתונים (Supabase)

מוגדר במלואו ב-`supabase/schema.sql`. תקציר:

```sql
documents: id, storage_path (R2 key), original_filename, status (processing/done/failed),
           error_message, uploaded_at
extractions: id, document_id (FK), student_id, school_year, disability_category,
             placement_type, weekly_support_hours, goals (jsonb), review_date,
             accommodations (jsonb), confidence, created_at
student_identity_map: student_id, real_name_encrypted   -- placeholder בלבד, לא נכתב אליו בפרויקט הזה
```

**מודל הגישה:** כל הגישה ל-Supabase עוברת דרך שרת ה-Next.js עם
`SUPABASE_SERVICE_ROLE_KEY` (המפתח הזה עוקף RLS). הדפדפן אינו פונה ל-Supabase
ישירות. בהתאם, RLS מופעל על שלוש הטבלאות **בלי** policies מוגדרות — כלומר
default-deny לתפקידי `anon`/`authenticated`, ו-RLS משמש כשכבת הגנה נוספת
(defense-in-depth) ולא כמנגנון ההרשאה המרכזי.

`error_message` (עמודה ב-`documents`) מאפשר לדשבורד להציג סיבת כשל למסמך
שנכשל (למשל סרוק גרוע/שדה שגוי) — נדרש לבדיקת edge cases בשלב 5 של הפרויקט.

## זרימת המערכת

**Runtime:** הכל רץ בתוך Next.js API route יחיד על Cloudflare Workers
(דרך `@cloudflare/next-on-pages`) — אין שירות backend נפרד. Workers לא
מריצים Python, כך שה-pipeline ב-production הוא port ל-TypeScript של
הלוגיקה שפותחה ב-`iep_schema.py`/`redaction.py`; שני קבצי הפייתון האלו
נשארים בריפו כ-reference implementation מקומי בלבד (עיצוב סכימה/פרומפט
בלי להריץ deploy), ולא כמה שרץ בפועל.

**AI provider:** Gemini Developer API (מפתח API), **לא** Vertex AI —
האימות של Vertex AI מבוסס service-account OAuth שלא רץ באופן טבעי על
Workers edge runtime. אותו מודל (`gemini-2.5-flash`) ואותה תמיכת Structured
Output; ההבדל הוא קו המוצר/חיוב ב-Google Cloud, לא היכולת.

```
POST /api/upload (PDF/סרוק)
    ↓ שומר קובץ ב-Cloudflare R2 (native binding), יוצר document_id, מחזיר מיד (status=processing)
    ↓
context.waitUntil(...) — ממשיך לרוץ באותה Worker invocation:
    1. חילוץ טקסט מהמסמך (unpdf)
    2. שכבת Redaction — הסרת שם מלא/ת.ז. לפני שליחה ל-Gemini API (regex)
    3. Gemini API (gemini-2.5-flash) — Structured Output לפי IEPExtraction (Zod)
    4. שמירת התוצאה ב-Supabase (extractions), עדכון status=done (או failed + error_message)
    ↓
Outgoing Webhook (HMAC-signed, ל-WEBHOOK_URL אם מוגדר) → "מסמך X עובד, confidence: 0.87"
```

## דרישות אבטחה ופרטיות

- שם מלא/ת.ז. **אינם** נשלחים ל-Gemini API (ספק חיצוני) — Redaction חובה לפני הקריאה.
- `student_id` הוא המזהה היחיד המשמש בטבלת `extractions`; המיפוי לזהות אמיתית
  מנותק בטבלה נפרדת עם הרשאות מחמירות.
- Webhook יוצא חתום ב-HMAC.
- REST API מוגן ב-API Key.

## Checklist עדכני (בהתאם למסמך הקורס, פרויקט ב')

- [x] Pydantic Schema עם לפחות 6 שדות + `confidence`
- [x] שכבת Redaction לפני קריאת ה-AI provider
- [ ] Upload endpoint + עיבוד אסינכרוני + Outgoing Webhook עם HMAC
- [ ] תוצאות ב-Supabase, טבלת מיפוי זהות מופרדת
- [ ] Dashboard: רשימה + פנל + Upload UI
- [ ] REST API עם API Key Auth
- [ ] נבדק על מדגם מסמכים (אמיתיים/סינתטיים) — accuracy מתועד
- [ ] חישוב עלות ל-100 מסמכים/יום

</div>
