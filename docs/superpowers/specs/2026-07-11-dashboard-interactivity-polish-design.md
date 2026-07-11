<div dir="rtl">

# עדכון הדשבורד — פידבק ויזואלי חלק וידידותי — Design Spec

## מטרה

לשפר את חוויית השימוש בדשבורד (לאחר עדכון ה-summary/רשימה קומפקטית/upload
מרובה) כך שתרגיש חלקה וידידותית יותר — לא שינוי בלוגיקה או במודל הנתונים,
רק שיפורים ויזואליים ב-CSS/Tailwind ורכיב React קטן אחד.

## החלטות עיצוב (מוסכמות)

1. **הרחבה/כיווץ אנימטיביים** — המעבר של פנל הפרטים ב-`document-list.tsx`
   (פתיחה/סגירה בלחיצה על שורה) יקבל טרנזישן חלק (height/opacity) במקום
   הופעה/היעלמות מיידית. CSS בלבד (Tailwind `transition-*`), אין צורך
   בספריית אנימציה חדשה.
2. **אינדיקטור טעינה בזמן עיבוד** — ליד התג "בעיבוד", spinner קטן מסתובב
   (CSS-only, `animate-spin` של Tailwind על אלמנט border קטן) — לא רק טקסט
   סטטי.
3. **תג ביטחון צבעוני** — במקום אחוז טקסטואלי גרידא, pill צבעוני לפי סף:
   ירוק (≥80%), צהוב/ענבר (50-79%), אדום (<50%). עדיין מציג את האחוז
   המדויק בתוך ה-pill, לא רק צבע.
4. **מצב ריק וידידותי** — כשאין אף מסמך ברשימה (`documents.length === 0`),
   הודעת קבלת פנים חמה + קריאה לפעולה במקום תיבה ריקה.
5. **פוליש hover/מעברים** — `transition-colors` על hover של שורה (קיים
   `hover:bg-slate-50`, חסר רק הטרנזישן החלק), fade-in עדין לפנל המורחב.
6. **טקסט סטטוס חם יותר** — התג עצמו (`STATUS_LABELS`) נשאר תמציתי
   לסריקה מהירה ("בעיבוד"/"הושלם"/"נכשל"), אך בתוך הפנל המורחב (מצב
   `processing`) הטקסט המלא הופך לחם יותר: "המסמך בדרך אלינו..." במקום
   "המסמך בעיבוד…" גרידא.

## ארכיטקטורה וקבצים

```
components/dashboard/document-list.tsx           +transition-colors על hover,
                                                   +wrapper עם טרנזישן ל-panel המורחב,
                                                   +componentconfidence badge צבעוני (מיובא),
                                                   +מצב ריק כשdocuments.length === 0
components/dashboard/confidence-badge.tsx         חדש — pill צבעוני, מקבל confidence: number
components/dashboard/document-detail-panel.tsx    processing state: טקסט חם יותר + spinner
```

`ConfidenceBadge` הוא קומפוננטה קטנה, חדשה, נפרדת (לא בתוך document-list.tsx
עצמו) כי היא בשימוש גם ברשימה (ליד כל שורה) וגם בפנל המורחב (ליד "ביטחון").
מוצגת רק כש-`doc.extraction` קיים (מסמך `done`) — עבור `processing`/`failed`,
שאין להם extraction, נשאר ה-"—" הקיים במקום הבאדג', ללא שינוי בהתנהגות הזו.

## פרטי מימוש

**Spinner (CSS-only):**
```tsx
<span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
```

**ConfidenceBadge — ספי צבע:**
```tsx
function badgeColor(confidence: number): string {
  if (confidence >= 0.8) return "bg-green-100 text-green-800";
  if (confidence >= 0.5) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}
```

**טרנזישן להרחבה:** שימוש ב-`grid-template-rows: 0fr → 1fr` (טכניקת
ה-CSS grid animation, לא תלוי ב-JS-measured height) עם `transition-[grid-template-rows]`,
כדי להימנע מ-hacks של `max-height` קבוע.

**מצב ריק (אין מסמכים בכלל):**
```tsx
{documents.length === 0 && (
  <p className="p-6 text-center text-slate-500">
    עדיין אין מסמכים — העלו את הראשון למעלה 👋
  </p>
)}
```
(`documents.length === 0` מספיק — אם אין מסמכים בכלל, מסנן אותם לא
משנה כלום, `filteredDocuments` יהיה ריק ממילא. המצב הזה לא תלוי בסינון.)

**מצב "הסינון הסתיר הכול" (שונה ממצב ריק אמיתי):**
```tsx
{filteredDocuments.length === 0 && documents.length > 0 && (
  <p className="p-6 text-center text-slate-500">
    אין מסמכים התואמים את הסינון הנוכחי
  </p>
)}
```

## בדיקות

- אין טסטים אוטומטיים חדשים — כל השינויים הם CSS/JSX ויזואליים ברכיבי
  React, עקביים עם המוסכמה הקיימת בפרויקט (קומפוננטות לא מקבלות טסטים
  אוטומטיים, נבדקות ידנית מול production/dev אמיתי).

## מה בכוונה נשאר מחוץ להיקף

- אין שינוי בלוגיקת polling/סינון/upload — רק בשכבה הוויזואלית.
- אין ספריית אנימציה חדשה (framer-motion וכו') — CSS/Tailwind בלבד, כדי
  לא להוסיף תלות חדשה לפרויקט בהיקף קורס.
- אין toast notifications (זו הייתה אופציה נפרדת שלא נבחרה) — נשאר עם
  ה-inline error list הקיים ב-upload-form.tsx.

</div>
