<div dir="rtl">

**⚠️ מסמך לדוגמה — לצורכי בדיקת מערכת בלבד. פיקטיבי לחלוטין. שמות, ת.ז. ופרטי
קשר בדויים לחלוטין — נועדו לבדוק את שכבת חיסוי המידע האישי (redaction) בלבד.**

---

# סיכום ועדת שילוב — בית ספר "כרמים", כיתה ה'

<!-- test note: PII redaction stress case, built against redaction.py's actual
patterns. "שם התלמיד/ה: נועם כהן" is a labeled name, caught by NAME_LABEL_RE.
"ת.ז. 123456782" has a valid Israeli-ID checksum, so it is redacted. The
internal case number 987654321 is 9 digits but an INVALID checksum, so it
should stay visible (redaction.py deliberately only redacts checksum-valid
IDs). The phone number and email should both be redacted by PHONE_RE and
EMAIL_RE. "אלמוג ברק", mentioned in free text with no label, has a first
name that is NOT in COMMON_FIRST_NAMES: a known limitation, documented in
redaction.py's own docstring, where this is likely NOT redacted by
FREE_NAME_RE. -->

שם התלמיד/ה: נועם כהן, ת.ז. 123456782. מספר תיק פנימי לצורך מעקב: 987654321.

ניתן ליצור קשר עם אמו של התלמיד, אורית, בטלפון 054-7654321 או בדוא"ל
orit.parent@gmail.com לתיאום פגישת מעקב.

בישיבה השתתף גם התלמיד אלמוג ברק מאותה כיתה, כמקרה השוואתי בלבד (ואינו
הנושא של מסמך זה).

## החלטת השיבוץ
חינוך מיוחד נפרד, עם 10 שעות תמיכה שבועיות.

## יעדים
- פיתוח מיומנויות תקשורת חברתית בסיסיות
- הרחבת יכולת ריכוז למשימה בודדת

## התאמות
- ליווי צמוד של סייעת
- תקשורת תומכת חזותית (לוח תמונות)

**מועד הוועדה הבאה:** 01/06/2028.

</div>
