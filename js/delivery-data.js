/* Данные и расчёт доставки автовозом от Владивостока. Единый источник для карты (dostavka-po-rossii.html)
   и кабинета клиента (status.html). Тарифы — реальный прайс партнёра-перевозчика на 2026 год. */
(function (g) {
'use strict';
const REGIONS = {"PrimorskyKrai": {"name": "Приморский край", "city": "Владивосток", "km": 0, "special": false}, "KhabarovskKrai": {"name": "Хабаровский край", "city": "Хабаровск", "km": 760, "special": false}, "JewishAutOblast": {"name": "Еврейская АО", "city": "Биробиджан", "km": 570, "special": false}, "AmurOblast": {"name": "Амурская область", "city": "Благовещенск", "km": 1600, "special": false}, "SakhalinOblast": {"name": "Сахалинская область", "city": "Южно-Сахалинск", "km": 900, "special": true}, "KamchatkaOblast": {"name": "Камчатский край", "city": "Петропавловск-Камчатский", "km": 0, "special": true}, "Koryakia": {"name": "Камчатский край", "city": "Петропавловск-Камчатский", "km": 0, "special": true}, "MagadanOblast": {"name": "Магаданская область", "city": "Магадан", "km": 0, "special": true}, "Chukotka": {"name": "Чукотский АО", "city": "Анадырь", "km": 0, "special": true}, "Yakutia": {"name": "Республика Саха (Якутия)", "city": "Якутск", "km": 2800, "special": true}, "Buryatia": {"name": "Бурятия", "city": "Улан-Удэ", "km": 3600, "special": false}, "ChitaOblast": {"name": "Забайкальский край", "city": "Чита", "km": 3200, "special": false}, "AgaBuryatia": {"name": "Забайкальский край", "city": "Чита", "km": 3200, "special": false}, "IrkutskOblast": {"name": "Иркутская область", "city": "Иркутск", "km": 4000, "special": false}, "UstOrdaBuryatia": {"name": "Иркутская область", "city": "Иркутск", "km": 4000, "special": false}, "Tuva": {"name": "Тыва", "city": "Кызыл", "km": 4700, "special": false}, "Khakassia": {"name": "Хакасия", "city": "Абакан", "km": 4700, "special": false}, "AltaiRepublic": {"name": "Республика Алтай", "city": "Горно-Алтайск", "km": 4600, "special": false}, "AltaiKrai": {"name": "Алтайский край", "city": "Барнаул", "km": 4400, "special": false}, "KemerovoOblast": {"name": "Кемеровская область", "city": "Кемерово", "km": 4750, "special": false}, "NovosibirskOblast": {"name": "Новосибирская область", "city": "Новосибирск", "km": 4200, "special": false}, "TomskOblast": {"name": "Томская область", "city": "Томск", "km": 5600, "special": false}, "OmskOblast": {"name": "Омская область", "city": "Омск", "km": 5000, "special": false}, "TaymyrAutDistrict": {"name": "Красноярский край", "city": "Красноярск", "km": 4850, "special": false}, "TyumenOblast": {"name": "Тюменская область", "city": "Тюмень", "km": 5700, "special": false}, "KurganOblast": {"name": "Курганская область", "city": "Курган", "km": 5750, "special": false}, "SverdlovskOblast": {"name": "Свердловская область", "city": "Екатеринбург", "km": 6100, "special": false}, "ChelyabinskOblast": {"name": "Челябинская область", "city": "Челябинск", "km": 6000, "special": false}, "KhantiaMansia": {"name": "ХМАО — Югра", "city": "Ханты-Мансийск", "km": 6200, "special": false}, "YamaloNenetsAutDistrict": {"name": "ЯНАО", "city": "Салехард", "km": 6600, "special": true}, "PermKrai": {"name": "Пермский край", "city": "Пермь", "km": 6600, "special": false}, "Bashkortostan": {"name": "Башкортостан", "city": "Уфа", "km": 6700, "special": false}, "OrenburgOblast": {"name": "Оренбургская область", "city": "Оренбург", "km": 6900, "special": false}, "Tatarstan": {"name": "Татарстан", "city": "Казань", "km": 7300, "special": false}, "Udmurtia": {"name": "Удмуртия", "city": "Ижевск", "km": 7000, "special": false}, "MariEl": {"name": "Марий Эл", "city": "Йошкар-Ола", "km": 7400, "special": false}, "Chuvashia": {"name": "Чувашия", "city": "Чебоксары", "km": 7500, "special": false}, "Mordovia": {"name": "Мордовия", "city": "Саранск", "km": 7700, "special": false}, "SamaraOblast": {"name": "Самарская область", "city": "Самара", "km": 7500, "special": false}, "UlyanovskOblast": {"name": "Ульяновская область", "city": "Ульяновск", "km": 7400, "special": false}, "PenzaOblast": {"name": "Пензенская область", "city": "Пенза", "km": 7800, "special": false}, "SaratovOblast": {"name": "Саратовская область", "city": "Саратов", "km": 7900, "special": false}, "KirovOblast": {"name": "Кировская область", "city": "Киров", "km": 6900, "special": false}, "VolgogradOblast": {"name": "Волгоградская область", "city": "Волгоград", "km": 8300, "special": false}, "AstrakhanOblast": {"name": "Астраханская область", "city": "Астрахань", "km": 8600, "special": false}, "Kalmykia": {"name": "Калмыкия", "city": "Элиста", "km": 8700, "special": false}, "RostovOblast": {"name": "Ростовская область", "city": "Ростов-на-Дону", "km": 8900, "special": false}, "KrasnodarKrai": {"name": "Краснодарский край", "city": "Краснодар", "km": 9300, "special": false}, "StavropolKrai": {"name": "Ставропольский край", "city": "Ставрополь", "km": 9100, "special": false}, "Adygeya": {"name": "Адыгея", "city": "Майкоп", "km": 9350, "special": false}, "Dagestan": {"name": "Дагестан", "city": "Махачкала", "km": 9400, "special": false}, "Chechnya": {"name": "Чечня", "city": "Грозный", "km": 9300, "special": false}, "Ingushetia": {"name": "Ингушетия", "city": "Магас", "km": 9250, "special": false}, "NorthOssetia": {"name": "Северная Осетия", "city": "Владикавказ", "km": 9200, "special": false}, "KabardinoBalkaria": {"name": "Кабардино-Балкария", "city": "Нальчик", "km": 9150, "special": false}, "KarachayCherkessia": {"name": "Карачаево-Черкесия", "city": "Черкесск", "km": 9150, "special": false}, "VoronezhOblast": {"name": "Воронежская область", "city": "Воронеж", "km": 8400, "special": false}, "LipetskOblast": {"name": "Липецкая область", "city": "Липецк", "km": 8300, "special": false}, "TambovOblast": {"name": "Тамбовская область", "city": "Тамбов", "km": 8200, "special": false}, "OryolOblast": {"name": "Орловская область", "city": "Орёл", "km": 8500, "special": false}, "KurskOblast": {"name": "Курская область", "city": "Курск", "km": 8600, "special": false}, "BelgorodOblast": {"name": "Белгородская область", "city": "Белгород", "km": 8700, "special": false}, "BryanskOblast": {"name": "Брянская область", "city": "Брянск", "km": 8700, "special": false}, "KalugaOblast": {"name": "Калужская область", "city": "Калуга", "km": 8850, "special": false}, "TulaOblast": {"name": "Тульская область", "city": "Тула", "km": 8750, "special": false}, "RyazanOblast": {"name": "Рязанская область", "city": "Рязань", "km": 8600, "special": false}, "VladimirOblast": {"name": "Владимирская область", "city": "Владимир", "km": 8800, "special": false}, "IvanovoOblast": {"name": "Ивановская область", "city": "Иваново", "km": 8850, "special": false}, "KostromaOblast": {"name": "Костромская область", "city": "Кострома", "km": 8950, "special": false}, "YaroslavlOblast": {"name": "Ярославская область", "city": "Ярославль", "km": 8900, "special": false}, "SmolenskOblast": {"name": "Смоленская область", "city": "Смоленск", "km": 9050, "special": false}, "TverOblast": {"name": "Тверская область", "city": "Тверь", "km": 9000, "special": false}, "Moscow": {"name": "Москва", "city": "Москва", "km": 9000, "special": false}, "MoscowOblast": {"name": "Московская область", "city": "Москва", "km": 9000, "special": false}, "NizhnyNovgorodOblast": {"name": "Нижегородская область", "city": "Нижний Новгород", "km": 8000, "special": false}, "LeningradOblast": {"name": "Ленинградская область", "city": "Санкт-Петербург", "km": 9800, "special": false}, "SaintPetersburg": {"name": "Санкт-Петербург", "city": "Санкт-Петербург", "km": 9800, "special": false}, "NovgorodOblast": {"name": "Новгородская область", "city": "Великий Новгород", "km": 9600, "special": false}, "PskovOblast": {"name": "Псковская область", "city": "Псков", "km": 9900, "special": false}, "VologdaOblast": {"name": "Вологодская область", "city": "Вологда", "km": 9300, "special": false}, "MurmanskOblast": {"name": "Мурманская область", "city": "Мурманск", "km": 10300, "special": false}, "Karelia": {"name": "Карелия", "city": "Петрозаводск", "km": 9900, "special": false}, "KomiRep": {"name": "Коми", "city": "Сыктывкар", "km": 8700, "special": false}, "ArkhangelskOblast": {"name": "Архангельская область", "city": "Архангельск", "km": 9400, "special": false}, "NenetsAutDistrict": {"name": "Ненецкий АО", "city": "Нарьян-Мар", "km": 9800, "special": true}, "KaliningradOblast": {"name": "Калининградская область", "city": "Калининград", "km": 0, "special": true}};
const FEDERAL_DISTRICTS = new Set(["Central", "FarEastern", "Northwestern", "Siberian", "Southern", "Urals", "Volga"]);
// В исходном SVG у Якутии, Красноярского края и Чукотки по два фрагмента контура;
// второй фрагмент не был подписан и получил автосгенерированный id — довешиваем его на тот же регион.
const EXTRA_FRAGMENTS = { path84: 'Yakutia', path107: 'TaymyrAutDistrict', path78: 'Chukotka' };
Object.keys(EXTRA_FRAGMENTS).forEach(pid => { REGIONS[pid] = REGIONS[EXTRA_FRAGMENTS[pid]]; });

// Реальный прайс-лист автовоза "Ozuma Logistic" (2026): малый класс (до 4.1м) / большой класс (до 5.1м),
// по конкретным направлениям. Для регионов без точной строки в прайсе — оценка по регрессии на этих
// же 16 реальных точек (км -> ₽), это честная замена старой калибровке всего по 4 маршрутам.
const REAL_QUOTES = {
  IrkutskOblast: [95000, 110000], UstOrdaBuryatia: [95000, 110000],
  Buryatia: [95000, 110000], ChitaOblast: [95000, 110000], AgaBuryatia: [95000, 110000],
  TaymyrAutDistrict: [125000, 145000], KemerovoOblast: [125000, 145000],
  TomskOblast: [125000, 145000], NovosibirskOblast: [125000, 145000],
  OmskOblast: [155000, 175000],
  TyumenOblast: [175000, 195000], SverdlovskOblast: [175000, 195000],
  ChelyabinskOblast: [195000, 215000], Bashkortostan: [195000, 215000],
  SamaraOblast: [195000, 215000], Tatarstan: [195000, 215000],
  NizhnyNovgorodOblast: [195000, 215000], Moscow: [195000, 215000], MoscowOblast: [195000, 215000],
  SaintPetersburg: [225000, 225000], LeningradOblast: [225000, 225000],
  KrasnodarKrai: [205000, 225000],
};
// Реальные сроки (рейс + ожидание отправки) по трём известным направлениям: Иркутск, Новосибирск, Москва
const REAL_DAYS = {
  IrkutskOblast: [7, 13], UstOrdaBuryatia: [7, 13], Buryatia: [7, 13], ChitaOblast: [7, 13], AgaBuryatia: [7, 13],
  NovosibirskOblast: [9, 13],
  Moscow: [14, 17], MoscowOblast: [14, 17],
};
const PRICE_BASE = 64126;
const PRICE_RATE = 17.6;

function estimatePrice(km, id) {
  if (id && REAL_QUOTES[id]) {
    const [low, high] = REAL_QUOTES[id];
    return { low, high, real: true };
  }
  const mid = PRICE_BASE + PRICE_RATE * km;
  return { low: Math.round(mid * 0.94 / 1000) * 1000, high: Math.round(mid * 1.06 / 1000) * 1000, real: false };
}
function estimateDays(km, id) {
  if (id && REAL_DAYS[id]) {
    const [low, high] = REAL_DAYS[id];
    return low + '–' + high + ' дней';
  }
  const low = Math.max(5, Math.round(4.6 + 0.00104 * km));
  const high = Math.max(low + 3, Math.round(9.8 + 0.0008 * km));
  return low + '–' + high + ' дней';
}

function regionsOfCity(name) {
  var n = String(name || '').trim().toLowerCase();
  return Object.keys(REGIONS).filter(function (id) {
    return !EXTRA_FRAGMENTS[id] && String(REGIONS[id].city).toLowerCase() === n;
  });
}

g.DELIVERY = { REGIONS: REGIONS, FEDERAL_DISTRICTS: FEDERAL_DISTRICTS, EXTRA_FRAGMENTS: EXTRA_FRAGMENTS,
  REAL_QUOTES: REAL_QUOTES, REAL_DAYS: REAL_DAYS, estimatePrice: estimatePrice, estimateDays: estimateDays, regionsOfCity: regionsOfCity };
})(window);
