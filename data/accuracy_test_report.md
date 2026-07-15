# Accuracy Test Report — 10 Synthetic Students, Real Schools

Generated 2026-07-15. Ground truth from `data/synthetic_iep_dataset_real_schools.xlsx` (Students_Synthetic sheet). Documents generated from a template, uploaded through the real production pipeline (`/api/upload`), extracted by Gemini.

## Exact-match summary

| student_id | school_year | placement_type | weekly_support_hours | review_date |
|---|---|---|---|---|
| STU-0008 | ✅ | ✅ | ✅ | ✅ |
| STU-0014 | ✅ | ✅ | ✅ | ✅ |
| STU-0017 | ✅ | ✅ | ❌ | ✅ |
| STU-0028 | ✅ | ✅ | ✅ | ✅ |
| STU-0038 | ❌ | ✅ | ✅ | ✅ |
| STU-0041 | ✅ | ✅ | ✅ | ✅ |
| STU-0053 | ✅ | ✅ | ✅ | ✅ |
| STU-0057 | ✅ | ✅ | ✅ | ✅ |
| STU-0065 | ❌ | ✅ | ✅ | ✅ |
| STU-0079 | ✅ | ✅ | ✅ | ✅ |

**37/40 exact-match checks passed** (93%) across the 4 structured fields × 10 students.

## Per-student detail

### STU-0008 — תיכון מכבים רעות

| Field | Ground truth | Extracted | Match |
|---|---|---|---|
| school_year | תשפ"ד | תשפ"ד | ✅ |
| placement_type | כיתה מיוחדת בבי"ס רגיל | כיתה מיוחדת בבי"ס רגיל | ✅ |
| weekly_support_hours | 10 | 10 | ✅ |
| review_date | 2027-03-22 | 2027-03-22 | ✅ |
| disability_category (free text, not auto-scored) | לקות חושית - שמיעה | לקות חושית - שמיעה | — |

**Goals** — ground truth (3) vs extracted (3):

Ground truth:
- שיפור מיומנויות חשבון בסיסיות
- שיפור קשב וריכוז במטלות לימודיות
- חיזוק ויסות רגשי והתנהגותי

Extracted:
- שיפור מיומנויות חשבון בסיסיות
- שיפור קשב וריכוז במטלות לימודיות
- חיזוק ויסות רגשי והתנהגותי

**Accommodations** — ground truth (3) vs extracted (3):

Ground truth:
- הפחתת עומס מטלות
- ליווי סייעת חלקי
- שימוש במחשב/מקלדת

Extracted:
- הפחתת עומס מטלות
- ליווי סייעת חלקי
- שימוש במחשב/מקלדת

**Summary (Gemini-written):** התלמיד משובץ בכיתה מיוחדת בבית ספר רגיל בשל לקות שמיעה, עם הקצאה של 10 שעות תמיכה שבועיות. עיקרי התוכנית מתמקדים בחיזוק מיומנויות לימודיות, קשב וויסות רגשי.

**Confidence** — Gemini reported: 1; dataset's invented confidence (not a target to match): 0.95

---

### STU-0014 — מקיף עמק החולה

| Field | Ground truth | Extracted | Match |
|---|---|---|---|
| school_year | תשפ"ד | תשפ"ד | ✅ |
| placement_type | הכלה חלקית | הכלה חלקית | ✅ |
| weekly_support_hours | 6 | 6 | ✅ |
| review_date | 2027-04-12 | 2027-04-12 | ✅ |
| disability_category (free text, not auto-scored) | לקות חושית - ראייה | לקות חושית - ראייה | — |

**Goals** — ground truth (3) vs extracted (3):

Ground truth:
- פיתוח מיומנויות חברתיות
- הכנה למעבר לחטיבת ביניים
- שיפור מיומנויות חשבון בסיסיות

Extracted:
- פיתוח מיומנויות חברתיות
- הכנה למעבר לחטיבת ביניים
- שיפור מיומנויות חשבון בסיסיות

**Accommodations** — ground truth (3) vs extracted (3):

Ground truth:
- שימוש במחשב/מקלדת
- בחינה בעל פה
- הפחתת עומס מטלות

Extracted:
- שימוש במחשב/מקלדת
- בחינה בעל פה
- הפחתת עומס מטלות

**Summary (Gemini-written):** התלמיד משובץ במסגרת הכלה חלקית עם 6 שעות תמיכה שבועיות, במטרה לקדם מיומנויות למידה וחברתיות לאור לקות הראייה שלו.

**Confidence** — Gemini reported: 0.95; dataset's invented confidence (not a target to match): 0.91

---

### STU-0017 — קמפוס פרס חדשנות ומנהיגות

| Field | Ground truth | Extracted | Match |
|---|---|---|---|
| school_year | תשפ"ד | תשפ"ד | ✅ |
| placement_type | הכלה מלאה | הכלה מלאה | ✅ |
| weekly_support_hours | 2 | null | ❌ |
| review_date | 2027-05-27 | 2027-05-27 | ✅ |
| disability_category (free text, not auto-scored) | הפרעה בספקטרום האוטיסטי | הפרעה בספקטרום האוטיסטי | — |

**Goals** — ground truth (2) vs extracted (2):

Ground truth:
- שיפור מיומנויות קריאה ופענוח
- חיזוק ויסות רגשי והתנהגותי

Extracted:
- שיפור מיומנויות קריאה ופענוח
- חיזוק ויסות רגשי והתנהגותי

**Accommodations** — ground truth (4) vs extracted (4):

Ground truth:
- פירוק הוראות למספר שלבים
- עזרים חזותיים תומכים
- ליווי סייעת חלקי
- בחינה בעל פה

Extracted:
- פירוק הוראות למספר שלבים
- עזרים חזותיים תומכים
- ליווי סייעת חלקי
- בחינה בעל פה

**Summary (Gemini-written):** התלמיד משובץ במסגרת של הכלה מלאה, עם דגש על שיפור מיומנויות קריאה וויסות רגשי תוך שימוש בעזרים חזותיים והתאמות בדרכי ההיבחנות.

**Confidence** — Gemini reported: 0.95; dataset's invented confidence (not a target to match): 0.87

---

### STU-0028 — כל ישראל חברים

| Field | Ground truth | Extracted | Match |
|---|---|---|---|
| school_year | תשפ"ד | תשפ"ד | ✅ |
| placement_type | הכלה מלאה | הכלה מלאה | ✅ |
| weekly_support_hours | 2 | 2 | ✅ |
| review_date | 2027-03-02 | 2027-03-02 | ✅ |
| disability_category (free text, not auto-scored) | לקות שכלית התפתחותית - בינונית | לקות שכלית התפתחותית - בינונית | — |

**Goals** — ground truth (2) vs extracted (2):

Ground truth:
- שיפור קשב וריכוז במטלות לימודיות
- עצמאות בתפקוד יומיומי בכיתה

Extracted:
- שיפור קשב וריכוז במטלות לימודיות
- עצמאות בתפקוד יומיומי בכיתה

**Accommodations** — ground truth (4) vs extracted (4):

Ground truth:
- ישיבה בקדמת הכיתה
- פירוק הוראות למספר שלבים
- עזרים חזותיים תומכים
- הארכת זמן במבחנים

Extracted:
- ישיבה בקדמת הכיתה
- פירוק הוראות למספר שלבים
- עזרים חזותיים תומכים
- הארכת זמן במבחנים

**Summary (Gemini-written):** התלמיד משובץ במסגרת הכלה מלאה עם שתי שעות תמיכה שבועיות, תוך התמקדות בשיפור הקשב והעצמאות הלימודית.

**Confidence** — Gemini reported: 1; dataset's invented confidence (not a target to match): 0.72

---

### STU-0038 — הראל

| Field | Ground truth | Extracted | Match |
|---|---|---|---|
| school_year | תשפ"ד | תשפ | ❌ |
| placement_type | הכלה חלקית | הכלה חלקית | ✅ |
| weekly_support_hours | 6 | 6 | ✅ |
| review_date | 2027-01-18 | 2027-01-18 | ✅ |
| disability_category (free text, not auto-scored) | הפרעת קשב וריכוז (ADHD) | ADHD | — |

**Goals** — ground truth (2) vs extracted (2):

Ground truth:
- עצמאות בתפקוד יומיומי בכיתה
- שיפור קשב וריכוז במטלות לימודיות

Extracted:
- עצמאות בתפקוד יומיומי בכיתה
- שיפור קשב וריכוז במטלות לימודיות

**Accommodations** — ground truth (4) vs extracted (4):

Ground truth:
- הפחתת עומס מטלות
- שימוש במחשב/מקלדת
- עזרים חזותיים תומכים
- ליווי סייעת חלקי

Extracted:
- הפחתת עומס מטלות
- שימוש במחשב/מקלדת
- עזרים חזותיים תומכים
- ליווי סייעת חלקי

**Summary (Gemini-written):** התלמיד משובץ במסגרת הכלה חלקית עם 6 שעות תמיכה שבועיות, כאשר עיקר המיקוד הוא בשיפור מיומנויות למידה וקשב תוך שימוש בהתאמות לימודיות וסיוע.

**Confidence** — Gemini reported: 0.95; dataset's invented confidence (not a target to match): 0.77

---

### STU-0041 — כנפי רוח

| Field | Ground truth | Extracted | Match |
|---|---|---|---|
| school_year | תשפ"ד | תשפ"ד | ✅ |
| placement_type | הכלה מלאה | הכלה מלאה | ✅ |
| weekly_support_hours | 3 | 3 | ✅ |
| review_date | 2027-01-24 | 2027-01-24 | ✅ |
| disability_category (free text, not auto-scored) | לקות תקשורת ושפה | לקות תקשורת ושפה | — |

**Goals** — ground truth (2) vs extracted (2):

Ground truth:
- פיתוח שפה ותקשורת פונקציונלית
- הכנה למעבר לחטיבת ביניים

Extracted:
- פיתוח שפה ותקשורת פונקציונלית
- הכנה למעבר לחטיבת ביניים

**Accommodations** — ground truth (3) vs extracted (3):

Ground truth:
- בחינה בעל פה
- פירוק הוראות למספר שלבים
- ליווי סייעת חלקי

Extracted:
- בחינה בעל פה
- פירוק הוראות למספר שלבים
- ליווי סייעת חלקי

**Summary (Gemini-written):** התלמיד שובץ במסגרת הכלה מלאה עם 3 שעות תמיכה שבועיות, תוך דגש על פיתוח כישורי תקשורת והכנה למעבר לחטיבת הביניים.

**Confidence** — Gemini reported: 0.95; dataset's invented confidence (not a target to match): 0.8

---

### STU-0053 — אורט סינגאלובסקי תל אביב

| Field | Ground truth | Extracted | Match |
|---|---|---|---|
| school_year | תשפ"ד | תשפ"ד | ✅ |
| placement_type | הכלה חלקית | הכלה חלקית | ✅ |
| weekly_support_hours | 6 | 6 | ✅ |
| review_date | 2027-05-05 | 2027-05-05 | ✅ |
| disability_category (free text, not auto-scored) | לקות מוטורית/פיזית | לקות מוטורית/פיזית | — |

**Goals** — ground truth (3) vs extracted (3):

Ground truth:
- הכנה למעבר לחטיבת ביניים
- חיזוק ויסות רגשי והתנהגותי
- פיתוח מיומנויות חברתיות

Extracted:
- הכנה למעבר לחטיבת ביניים
- חיזוק ויסות רגשי והתנהגותי
- פיתוח מיומנויות חברתיות

**Accommodations** — ground truth (3) vs extracted (3):

Ground truth:
- עזרים חזותיים תומכים
- ליווי סייעת חלקי
- הארכת זמן במבחנים

Extracted:
- עזרים חזותיים תומכים
- ליווי סייעת חלקי
- הארכת זמן במבחנים

**Summary (Gemini-written):** התלמיד שובץ במסגרת הכלה חלקית עם הקצאה של 6 שעות תמיכה שבועיות. התוכנית מתמקדת בחיזוק מיומנויות חברתיות וויסות רגשי לצורך הכנה למעבר לחטיבת ביניים.

**Confidence** — Gemini reported: 1; dataset's invented confidence (not a target to match): 0.96

---

### STU-0057 — בי"ס אזורי חנ"מ שחף

| Field | Ground truth | Extracted | Match |
|---|---|---|---|
| school_year | תשפ"ד | תשפ"ד | ✅ |
| placement_type | חינוך מיוחד נפרד | חינוך מיוחד נפרד | ✅ |
| weekly_support_hours | 30 | 30 | ✅ |
| review_date | 2027-01-09 | 2027-01-09 | ✅ |
| disability_category (free text, not auto-scored) | עיכוב התפתחותי | עיכוב התפתחותי | — |

**Goals** — ground truth (2) vs extracted (2):

Ground truth:
- שיפור מוטוריקה עדינה
- שיפור מיומנויות קריאה ופענוח

Extracted:
- שיפור מוטוריקה עדינה
- שיפור מיומנויות קריאה ופענוח

**Accommodations** — ground truth (3) vs extracted (3):

Ground truth:
- הארכת זמן במבחנים
- שימוש במחשב/מקלדת
- פירוק הוראות למספר שלבים

Extracted:
- הארכת זמן במבחנים
- שימוש במחשב/מקלדת
- פירוק הוראות למספר שלבים

**Summary (Gemini-written):** התלמיד שובץ במסגרת חינוך מיוחד נפרד וזכאי ל-30 שעות תמיכה שבועיות. עיקרי הטיפול מתמקדים בשיפור מיומנויות קריאה ומוטוריקה עדינה לצד התאמות לימודיות.

**Confidence** — Gemini reported: 0.95; dataset's invented confidence (not a target to match): 0.77

---

### STU-0065 — התומר

| Field | Ground truth | Extracted | Match |
|---|---|---|---|
| school_year | תשפ"ד | תשפ | ❌ |
| placement_type | חינוך מיוחד נפרד | חינוך מיוחד נפרד | ✅ |
| weekly_support_hours | 25 | 25 | ✅ |
| review_date | 2027-03-17 | 2027-03-17 | ✅ |
| disability_category (free text, not auto-scored) | לקות למידה | לקות למידה | — |

**Goals** — ground truth (3) vs extracted (3):

Ground truth:
- פיתוח מיומנויות חברתיות
- שיפור כתיבה ותפקוד בכיתה
- שיפור מיומנויות קריאה ופענוח

Extracted:
- פיתוח מיומנויות חברתיות
- שיפור כתיבה ותפקוד בכיתה
- שיפור מיומנויות קריאה ופענוח

**Accommodations** — ground truth (2) vs extracted (2):

Ground truth:
- שימוש במחשב/מקלדת
- הארכת זמן במבחנים

Extracted:
- שימוש במחשב/מקלדת
- הארכת זמן במבחנים

**Summary (Gemini-written):** התלמיד משובץ במסגרת חינוך מיוחד נפרד עם הקצאה של 25 שעות תמיכה שבועיות. המטרות המרכזיות מתמקדות בשיפור מיומנויות למידה בסיסיות, בהן קריאה וכתיבה, לצד פיתוח כישורים חברתיים.

**Confidence** — Gemini reported: 0.95; dataset's invented confidence (not a target to match): 0.95

---

### STU-0079 — עירוני נווה צדק

| Field | Ground truth | Extracted | Match |
|---|---|---|---|
| school_year | תשפ"ד | תשפ"ד | ✅ |
| placement_type | חינוך מיוחד נפרד | חינוך מיוחד נפרד | ✅ |
| weekly_support_hours | 30 | 30 | ✅ |
| review_date | 2027-03-27 | 2027-03-27 | ✅ |
| disability_category (free text, not auto-scored) | לקות שכלית התפתחותית - קלה | לקות שכלית התפתחותית - קלה | — |

**Goals** — ground truth (2) vs extracted (2):

Ground truth:
- פיתוח שפה ותקשורת פונקציונלית
- שיפור קשב וריכוז במטלות לימודיות

Extracted:
- פיתוח שפה ותקשורת פונקציונלית
- שיפור קשב וריכוז במטלות לימודיות

**Accommodations** — ground truth (2) vs extracted (2):

Ground truth:
- ליווי סייעת חלקי
- הפחתת עומס מטלות

Extracted:
- ליווי סייעת חלקי
- הפחתת עומס מטלות

**Summary (Gemini-written):** התלמיד שובץ במסגרת חינוך מיוחד נפרד עם הקצאה של 30 שעות תמיכה שבועיות. עיקרי התוכנית מתמקדים בפיתוח תקשורת פונקציונלית ושיפור מיומנויות קשב וריכוז.

**Confidence** — Gemini reported: 0.95; dataset's invented confidence (not a target to match): 0.84

---
