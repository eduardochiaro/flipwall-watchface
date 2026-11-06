#include "../flipwall.h"

// Month (%b) and weekday (%a) short names, ASCII-folded to 3 letters so they
// render with the Latin-only bundled font. Numbers and data readouts are
// language-neutral; AM/PM is left untranslated.
// Order must match LANG_OPTIONS in config.js (0 = English default).
// The tables are fixed-width char arrays, not pointer arrays: pointers land in
// .data, which costs RAM on the 64KB watches, where the heap is tight (see
// fctx_open in blocks.c). Widen a column when a longer word comes along.

// tm_mon 0..11 (Jan..Dec).
static const char MONTHS[LANG_COUNT][12][4] = {
  {"Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"}, // en
  {"Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"}, // es
  {"Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"}, // pt
  {"Jan","Fev","Mar","Avr","Mai","Jui","Jul","Aou","Sep","Oct","Nov","Dec"}, // fr
  {"Jan","Feb","Mar","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"}, // de
  {"Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"}, // it
  {"Jan","Feb","Mrt","Apr","Mei","Jun","Jul","Aug","Sep","Okt","Nov","Dec"}, // nl
  {"Sty","Lut","Mar","Kwi","Maj","Cze","Lip","Sie","Wrz","Paz","Lis","Gru"}, // pl
  {"Oca","Sub","Mar","Nis","May","Haz","Tem","Agu","Eyl","Eki","Kas","Ara"}, // tr
  {"Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"}, // id
};
// tm_wday 0..6 (Sun..Sat).
static const char WDAYS[LANG_COUNT][7][4] = {
  {"Sun","Mon","Tue","Wed","Thu","Fri","Sat"}, // en
  {"Dom","Lun","Mar","Mie","Jue","Vie","Sab"}, // es
  {"Dom","Seg","Ter","Qua","Qui","Sex","Sab"}, // pt
  {"Dim","Lun","Mar","Mer","Jeu","Ven","Sam"}, // fr
  {"Son","Mon","Die","Mit","Don","Fre","Sam"}, // de
  {"Dom","Lun","Mar","Mer","Gio","Ven","Sab"}, // it
  {"Zon","Maa","Din","Woe","Don","Vri","Zat"}, // nl
  {"Nie","Pon","Wto","Sro","Czw","Pia","Sob"}, // pl
  {"Paz","Pzt","Sal","Car","Per","Cum","Cmt"}, // tr
  {"Min","Sen","Sel","Rab","Kam","Jum","Sab"}, // id
};

// 2-letter humidity prefix so the readout is identifiable (e.g. "Hu45%").
// Latin-folded to the bundled font's glyph set; order matches MONTHS/WDAYS.
static const char HUMIDITY[LANG_COUNT][3] = {
  "Hu", // en Humidity
  "Hu", // es Humedad
  "Um", // pt Umidade
  "Hu", // fr Humidite
  "Lf", // de Luftfeuchtigkeit
  "Um", // it Umidita
  "Vo", // nl Vochtigheid
  "Wi", // pl Wilgotnosc
  "Ne", // tr Nem
  "Ke", // id Kelembaban
};

// 3-letter humidity caption for the big humidity block ("Hum" over "47%").
static const char HUMIDITY3[LANG_COUNT][4] = {
  "Hum", // en Humidity
  "Hum", // es Humedad
  "Umi", // pt Umidade
  "Hum", // fr Humidite
  "Luf", // de Luftfeuchtigkeit
  "Umi", // it Umidita
  "Voc", // nl Vochtigheid
  "Wil", // pl Wilgotnosc
  "Nem", // tr Nem
  "Kel", // id Kelembaban
};

// Battery caption for the big battery block ("Batt" over "82%").
static const char BATTERY[LANG_COUNT][5] = {
  "Batt", // en Battery
  "Bat",  // es Bateria
  "Bat",  // pt Bateria
  "Batt", // fr Batterie
  "Batt", // de Batterie
  "Batt", // it Batteria
  "Batt", // nl Batterij
  "Bat",  // pl Bateria
  "Pil",  // tr Pil
  "Bat",  // id Baterai
};

// Captions for the date and health blocks, Latin-folded like the rest. Short
// enough for a caption band; the short blocks prefix the value with them.
static const char WEEK[LANG_COUNT][6] = {
  "Week", "Sem", "Sem", "Sem", "KW", "Sett", "Week", "Tydz", "Hafta", "Mgg",
};
static const char DAY[LANG_COUNT][6] = {
  "Day", "Dia", "Dia", "Jour", "Tag", "Gior", "Dag", "Dzien", "Gun", "Hari",
};
static const char ACTIVE[LANG_COUNT][7] = {
  "Active", "Activo", "Ativo", "Actif", "Aktiv", "Attivo", "Actief", "Aktyw", "Aktif", "Aktif",
};
static const char SLEEP[LANG_COUNT][7] = {
  "Sleep", "Sueno", "Sono", "Somm", "Schlaf", "Sonno", "Slaap", "Sen", "Uyku", "Tidur",
};

const char *month_name(void)      { return MONTHS[s_lang][s_now.tm_mon]; }
const char *wday_name(void)       { return WDAYS[s_lang][s_now.tm_wday]; }
const char *humidity_label(void)  { return HUMIDITY[s_lang]; }
const char *humidity_label3(void) { return HUMIDITY3[s_lang]; }
const char *battery_label(void)   { return BATTERY[s_lang]; }
const char *week_label(void)      { return WEEK[s_lang]; }
const char *day_label(void)       { return DAY[s_lang]; }
const char *active_label(void)    { return ACTIVE[s_lang]; }
const char *sleep_label(void)     { return SLEEP[s_lang]; }
