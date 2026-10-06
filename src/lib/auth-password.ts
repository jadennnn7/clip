/** Mindestlänge fürs Passwort — Server prüft sie, das Formular nennt sie. */
export const MIN_PASSWORD_LENGTH = 8

/** Mehr verarbeitet Supabase (bcrypt) nicht. */
export const MAX_PASSWORD_LENGTH = 72

/** Hier legt man nach „Passwort vergessen?" ein neues fest (Ziel des Links aus der Mail). */
export const NEW_PASSWORD_PATH = '/new-password'
