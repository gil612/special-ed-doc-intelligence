<div dir="rtl">

# Dashboard UI — Design Spec

## מטרה

לממש את פריט ה-checklist "Dashboard: רשימה + פנל + Upload UI" (SPEC.md /
README.md) — מסך יחיד המציג רשימת מסמכים שהועלו, פנל פרטים בלחיצה על שורה,
וטופס Upload חדש. זהו החלק המרכזי האחרון שנותר לפני "REST API read
endpoints" ו-"accuracy testing" ב-checklist.

## החלטות עיצוב (מוסכמות)

1. **קריאת נתונים:** `app/page.tsx` הוא Server Component שקורא ישירות
   מ-Supabase (JOIN בין `documents` ל-`extractions`) — לא דרך REST API
   נפרד. ה-REST API הציבורי (`GET /api/documents`) נשאר פריט checklist
   נפרד לעתיד, לא תלות של הדשבורד.
2. **Upload דרך Server Action, לא fetch ל-`/api/upload`:** הדפדפן לא יכול
   להחזיק את `DOCUMENTS_API_KEY` בבטחה. הלוגיקה המשותפת (R2 put →
   insertDocument → `ctx.waitUntil(processDocument(...))`) מופקת
   ל-`lib/upload-document.ts`, וגם ה-route וגם ה-Server Action קוראים לה —
   כדי לא לשכפל קוד. חשוב: בדיקת ה-`X-API-Key` **נשארת רק בתוך
   `app/api/upload/route.ts`**, לפני הקריאה ל-`lib/upload-document.ts` —
   הפונקציה המשותפת עצמה אינה בודקת מפתח, וה-Server Action לא בודק אותו
   בכלל (קריאה server-side מהימנה, לא דרך הרשת).
3. **אין login על הדשבורד עצמו** — עקבי עם שאר הפרויקט, שאין בו מנגנון
   user-auth בכלל. בדיקת ה-API Key נשארת רק על `/api/upload` הישיר, עבור
   קוראים חיצוניים.
4. **Polling רק לשורות "processing":** קומפוננטת client קוראת
   ל-`router.refresh()` כל ~3 שניות, אך ורק כל עוד יש שורה במצב
   `processing` — מפסיק אוטומטית ברגע שהכל `done`/`failed`.
5. **סינון (תאריך / confidence מינימלי) בצד ה-client** על הרשימה שכבר
   נטענה — היקף הפרויקט (הדגמת קורס) לא מצדיק query params בצד השרת.
6. **פנל הפרטים מציג שדות מפורמטים, לא JSON גולמי** — תוויות בעברית לכל
   שדה, `goals`/`accommodations` כרשימות, `confidence` כאחוז.

## ארכיטקטורה וקבצים

```
app/page.tsx                              Server Component — שולף documents+extractions מ-Supabase
app/actions.ts                            "use server" — uploadDocument(formData)
lib/upload-document.ts                    לוגיקה משותפת: R2 put + insertDocument + waitUntil(processDocument)
app/api/upload/route.ts                   מעודכן: קורא ל-lib/upload-document.ts במקום לשכפל
components/dashboard/document-table.tsx   client: טבלה + בחירת שורה + polling
components/dashboard/document-detail-panel.tsx   פנל פרטים מפורמט
components/dashboard/upload-form.tsx      client: טופס Upload מחובר ל-Server Action
components/dashboard/document-filters.tsx client: פילטרים (תאריך, confidence מינימלי)
lib/upload-document.test.ts               טסטים ל-lib/upload-document.ts (פונקציה טהורה, dependency injection כמו lib/process-document.ts)
```

## זרימת נתונים

```
בקשת GET ל-/ (Server Component):
  1. Supabase query: documents LEFT JOIN extractions (לפי document_id)
  2. render <Dashboard documents={rows} /> (client component)

לחיצה על שורה בטבלה:
  1. state מקומי (selectedId) מתעדכן
  2. <DocumentDetailPanel> מציג את הנתונים שכבר קיימים ב-props (אין fetch נוסף)

Upload דרך הטופס:
  1. <form action={uploadDocument}> (Server Action)
  2. uploadDocument קורא ל-lib/upload-document.ts:
     handleUpload(fileBuffer, filename, env, ctx) -> { documentId }
  3. revalidatePath("/") כדי שהרשימה תרענן ותציג את השורה החדשה (status=processing)
  4. הקומפוננטה הקליינטית מזהה שורה ב-processing ומתחילה polling עד done/failed
```

## טיפול בשגיאות

- מסמך שנכשל (`status=failed`) מציג את `error_message` בטבלה ובפנל, במקום
  את השדות המחולצים.
- כשלון ב-upload עצמו (למשל קובץ לא-PDF, או כשלון R2/Supabase) — הטופס
  מציג הודעת שגיאה מוחזרת מה-Server Action, לא crash של הדף.

## בדיקות

- `lib/upload-document.test.ts` — טסטים ל-`handleUpload` בסגנון
  `lib/process-document.test.ts` הקיים (dependency injection, fakes ל-R2
  ול-Supabase).
- קומפוננטות ה-React עצמן לא מקבלות טסטים אוטומטיים בשלב זה (אין תשתית
  React-testing בפרויקט) — נבדקות ידנית מול שרת dev אמיתי, באותה שיטה
  שהשתמשנו בה לאורך הפרויקט.

## מה בכוונה נשאר מחוץ להיקף

- REST API ציבורי (`GET /api/documents`, `GET /api/documents/{id}`) —
  פריט checklist נפרד.
- Login/הרשאות על הדשבורד עצמו.
- Server-side filtering/pagination — היקף הפרויקט קטן מדי כדי להצדיק זאת כרגע.

</div>
