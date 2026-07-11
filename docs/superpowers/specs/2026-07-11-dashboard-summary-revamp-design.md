<div dir="rtl">

# עדכון הדשבורד — סיכום לכל מסמך, Upload מרובה, רשימה קומפקטית — Design Spec

## מטרה

לשפר את חוויית הדשבורד שנבנה בפיצ'ר הקודם (`docs/superpowers/specs/2026-07-11-dashboard-ui-design.md`):
1. כל מסמך יציג סיכום קצר, קריא, שנוצר על ידי Gemini — לא רק שדות גולמיים.
2. אפשרות להעלות כמה קבצים בבת אחת, כל אחד מתקדם באופן עצמאי.
3. הטבלה הנוכחית (טבלה + פנל צד) מוחלפת ברשימה קומפקטית יותר, עם הרחבה
   inline בלחיצה על שורה — לא שינוי בלוגיקת ה-polling/הסינון עצמה.

## החלטות עיצוב (מוסכמות)

1. **מקור הסיכום: שדה חדש שנכתב על ידי Gemini**, לא הרכבה מהשדות הקיימים
   בצד ה-client. מתווסף `summary` ל-`IEPExtraction` (גם ב-`iep_schema.py`
   וגם ב-`lib/extraction-schema.ts`), נכתב **באותה קריאת API** שכבר
   קיימת ל-Gemini (מתווסף ל-`buildExtractionPrompt` ול-`RESPONSE_SCHEMA`
   ב-`lib/gemini.ts`) — אין קריאת API נוספת, אין עלות נוספת.
2. **תצוגה: רשימה קומפקטית עם הרחבה inline**, לא טבלה+פנל צד כפי שהיה
   עד כה. כל שורה מציגה שם קובץ + תג סטטוס + אחוז ביטחון בלבד. לחיצה על
   שורה פותחת אותה inline ומציגה את הסיכום ואת פירוט השדות המלא (כפי
   שכבר קיים ב-`DocumentDetailPanel`, רק מוצג בתוך השורה במקום ב-`aside`
   צדדי). לוגיקת ה-polling (Task 4) והסינון (Task 5) הקיימת נשארת ללא
   שינוי — רק המעטפת הוויזואלית משתנה.
3. **Upload מרובה קבצים, כל קובץ מתקדם בנפרד.** input עם `multiple`;
   בצד ה-client, לולאה על כל הקבצים שנבחרו קוראת ל-Server Action הקיים
   `uploadDocument` (`app/actions.ts`) פעם אחת לכל קובץ, במקביל
   (`Promise.allSettled` — ראו "טיפול בשגיאות" למטה) — **אין שינוי בחתימת
   ה-Server Action עצמה**, כל קריאה יוצרת שורת `documents` משלה מיד,
   בדיוק כמו העלאה בודדת היום.

## ארכיטקטורה וקבצים

```
iep_schema.py                              +summary: Optional[str] בסכימה
lib/extraction-schema.ts                   +summary: nullable string בסכימה
lib/extraction-schema.test.ts              טסטים לשדה summary (nullable, מועבר כמו שאר השדות)
lib/gemini.ts                              buildExtractionPrompt +הנחיה ל-summary
                                            RESPONSE_SCHEMA +summary (nullable string)
lib/supabase.ts                            DocumentRow/listDocumentsWithExtractions +summary
supabase/schema.sql                        extractions.summary text (nullable)
components/dashboard/document-list.tsx     חדש — מחליף document-table.tsx: רשימה
                                            קומפקטית + הרחבה inline בלחיצה
components/dashboard/document-detail-panel.tsx  נשאר כפי שהוא (הצגת פירוט מלא),
                                            רק מוצג עכשיו inline בתוך document-list.tsx
                                            במקום ב-aside צדדי + מוסיף שורת summary למעלה
components/dashboard/upload-form.tsx       input מקבל multiple; הגשה מריצה
                                            Promise.all על כל קובץ שנבחר
app/page.tsx                               מייבא DocumentList במקום DocumentTable
```

`document-table.tsx` יוסר (מוחלף ב-`document-list.tsx`); `document-filters.tsx`
נשאר ללא שינוי ומוזן לתוך `document-list.tsx` באותו אופן שהוזן קודם ל-`document-table.tsx`.

## זרימת נתונים

```
בקשת GET ל-/ (ללא שינוי):
  Server Component שולף documents+extractions (כולל summary) מ-Supabase

לחיצה על שורה ברשימה:
  1. state מקומי (selectedId) מתעדכן — כמו קודם
  2. השורה עצמה מתרחבת (inline) ומציגה summary + פירוט מלא, במקום פנל צד

Upload של מספר קבצים:
  1. משתמש/ת בוחר/ת N קבצים ב-<input multiple>
  2. handleSubmit רץ Promise.allSettled של N קריאות ל-uploadDocument (אחת לכל קובץ)
  3. כל קריאה: revalidatePath("/") משלה ברגע שמסתיימת — כל קובץ מופיע כשורה
     חדשה (status=processing) ברגע שההעלאה שלו עצמה הצליחה, לא מחכה לשאר
  4. Polling הקיים (Task 4) מזהה כל שורה ב-processing ומרענן עד שהיא מסתיימת,
     בדיוק כמו היום — לא תלוי כמה קבצים הועלו יחד
```

## טיפול בשגיאות

- אם קובץ בודד בתוך batch נכשל ב-upload עצמו (למשל סוג קובץ לא-PDF), רק
  אותו קובץ מציג שגיאה — שאר הקבצים בבאטש ממשיכים כרגיל. ה-Server Action
  הקיים כבר מחזיר `{success:false, error}` במקום לזרוק ברוב המקרים, אך
  יש נתיב חיצוני ל-try/catch שלו (`getCloudflareContext()`,
  `file.arrayBuffer()`, יצירת ה-client) שכן יכול לזרוק — ולכן הצד
  הקליינטי משתמש ב-`Promise.allSettled` (לא `Promise.all` רגיל), כדי
  שקריאה אחת שנכשלת בצורה בלתי-צפויה לא תפריע לטיפול בתוצאות של שאר
  הקבצים בבאטש.
- `summary: null` (Gemini לא הצליח לייצר סיכום, מקרה נדיר) — הרשימה
  הקומפקטית מציגה fallback טקסטואלי ("אין סיכום זמין") במקום להשאיר ריק.

## בדיקות

- `lib/extraction-schema.test.ts`: מקרה נוסף ל-`summary` (nullable,
  מועבר כמו `school_year` — לא נדרשת בדיקה חדשה מעבר לזה, זה שדה מחרוזת
  nullable רגיל).
- קומפוננטות ה-React (`document-list.tsx`, שינוי ב-`upload-form.tsx`)
  לא מקבלות טסטים אוטומטיים, עקביות עם שאר קומפוננטות הדשבורד — נבדקות
  ידנית מול production אמיתי, כפי שנעשה לאורך הפרויקט.

## מה בכוונה נשאר מחוץ להיקף

- אין שינוי בלוגיקת ה-polling או הסינון עצמה — רק במעטפת הוויזואלית.
- אין מגבלת מספר קבצים ב-upload מרובה (מוגבל רק על ידי מה שהדפדפן/ה-input
  מאפשרים) — לא פרויקט בקנה מידה שמצדיק rate-limiting בצד client כרגע.
- אין progress bar אחוזי-העלאה per-file (כמה % מהקובץ כבר הועלה) — רק
  מצב processing/done/failed ברמת המסמך, כפי שכבר קיים.

</div>
