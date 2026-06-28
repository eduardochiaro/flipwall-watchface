#include "flipwall.h"

// Month (%b) and weekday (%a) short names, ASCII-folded to 3 letters so they
// render with the Latin-only bundled font. Numbers and data readouts are
// language-neutral; AM/PM is left untranslated.
// Order must match LANG_OPTIONS in config.js (0 = English default).

// tm_mon 0..11 (Jan..Dec).
static const char *const MONTHS[LANG_COUNT][12] = {
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
static const char *const WDAYS[LANG_COUNT][7] = {
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
static const char *const HUMIDITY[LANG_COUNT] = {
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

const char *month_name(void)     { return MONTHS[s_lang][s_now.tm_mon]; }
const char *wday_name(void)      { return WDAYS[s_lang][s_now.tm_wday]; }
const char *humidity_label(void) { return HUMIDITY[s_lang]; }
