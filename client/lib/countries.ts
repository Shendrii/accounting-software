export const COUNTRY_NAMES: string[] = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia', 'Australia',
  'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Belarus', 'Belgium', 'Belize',
  'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei',
  'Bulgaria', 'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon', 'Canada', 'Chad', 'Chile',
  'China', 'Colombia', 'Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic',
  'Denmark', 'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'Estonia', 'Ethiopia',
  'Finland', 'France', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Guatemala', 'Guinea',
  'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland',
  'Israel', 'Italy', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kosovo', 'Kuwait',
  'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg',
  'Madagascar', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Mexico', 'Moldova', 'Monaco',
  'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nepal',
  'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia',
  'Norway', 'Oman', 'Pakistan', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines',
  'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saudi Arabia', 'Senegal',
  'Serbia', 'Singapore', 'Slovakia', 'Slovenia', 'Somalia', 'South Africa', 'South Korea',
  'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Sweden', 'Switzerland', 'Syria', 'Taiwan',
  'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Trinidad and Tobago', 'Tunisia',
  'Turkey', 'Turkmenistan', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom',
  'United States', 'Uruguay', 'Uzbekistan', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
];

export const CITIES_BY_COUNTRY: Record<string, string[]> = {
  'Philippines': [
    'Manila', 'Quezon City', 'Cebu City', 'Davao City', 'Caloocan', 'Zamboanga City',
    'Taguig', 'Antipolo', 'Pasig', 'Cagayan de Oro', 'Parañaque', 'Valenzuela',
    'Las Piñas', 'Makati', 'Bacoor', 'General Santos', 'Muntinlupa', 'San Jose del Monte',
    'Bacolod', 'Marikina', 'Malabon', 'Navotas', 'Pasay', 'Mandaluyong', 'San Juan',
    'Iloilo City', 'Angeles', 'Baguio', 'Mandaue', 'Lapu-Lapu', 'Imus', 'Calamba',
    'Lipa', 'Batangas City', 'Lucena', 'Naga', 'Legazpi', 'Puerto Princesa',
  ],
  'United States': [
    'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio',
    'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville', 'Fort Worth', 'Columbus',
    'San Francisco', 'Charlotte', 'Indianapolis', 'Seattle', 'Denver', 'Washington DC',
    'Nashville', 'Oklahoma City', 'El Paso', 'Boston', 'Portland', 'Las Vegas', 'Memphis',
    'Louisville', 'Baltimore', 'Milwaukee', 'Albuquerque', 'Tucson', 'Fresno', 'Sacramento',
    'Atlanta', 'Miami', 'Minneapolis', 'Tampa', 'New Orleans', 'Cleveland',
  ],
  'United Kingdom': [
    'London', 'Birmingham', 'Manchester', 'Glasgow', 'Liverpool', 'Leeds', 'Sheffield',
    'Edinburgh', 'Bristol', 'Leicester', 'Coventry', 'Nottingham', 'Bradford', 'Cardiff',
    'Belfast', 'Hull', 'Newcastle', 'Southampton', 'Derby', 'Portsmouth', 'Brighton',
    'Oxford', 'Cambridge', 'Reading', 'Aberdeen', 'Exeter', 'Plymouth',
  ],
  'Australia': [
    'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Canberra', 'Hobart',
    'Darwin', 'Gold Coast', 'Newcastle', 'Wollongong', 'Geelong', 'Townsville',
    'Cairns', 'Toowoomba', 'Ballarat', 'Bendigo', 'Launceston',
  ],
  'Canada': [
    'Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa', 'Winnipeg',
    'Quebec City', 'Hamilton', 'Brampton', 'Surrey', 'Halifax', 'London', 'Markham',
    'Vaughan', 'Gatineau', 'Longueuil', 'Burnaby', 'Saskatoon', 'Kitchener', 'Windsor',
  ],
  'India': [
    'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad',
    'Jaipur', 'Surat', 'Lucknow', 'Kanpur', 'Nagpur', 'Visakhapatnam', 'Indore',
    'Thane', 'Bhopal', 'Pimpri-Chinchwad', 'Patna', 'Vadodara', 'Ghaziabad', 'Agra',
    'Nashik', 'Faridabad', 'Meerut', 'Rajkot', 'Varanasi',
  ],
  'China': [
    'Shanghai', 'Beijing', 'Guangzhou', 'Shenzhen', 'Chongqing', 'Tianjin', 'Wuhan',
    'Chengdu', 'Nanjing', 'Hangzhou', 'Shenyang', 'Xian', 'Dongguan', 'Harbin',
    'Qingdao', 'Foshan', 'Dalian', 'Zhengzhou', 'Jinan', 'Changsha',
  ],
  'Japan': [
    'Tokyo', 'Yokohama', 'Osaka', 'Nagoya', 'Sapporo', 'Fukuoka', 'Kawasaki', 'Kobe',
    'Kyoto', 'Saitama', 'Hiroshima', 'Sendai', 'Kitakyushu', 'Chiba', 'Sakai',
    'Niigata', 'Hamamatsu', 'Shizuoka', 'Sagamihara', 'Okayama',
  ],
  'Germany': [
    'Berlin', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt', 'Stuttgart', 'Düsseldorf',
    'Dortmund', 'Essen', 'Leipzig', 'Bremen', 'Dresden', 'Hanover', 'Nuremberg',
    'Duisburg', 'Bochum', 'Wuppertal', 'Bielefeld', 'Bonn', 'Münster',
  ],
  'France': [
    'Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Strasbourg', 'Montpellier',
    'Bordeaux', 'Lille', 'Rennes', 'Reims', 'Le Havre', 'Saint-Étienne', 'Toulon',
    'Grenoble', 'Dijon', 'Nîmes', 'Angers', 'Villeurbanne',
  ],
  'Brazil': [
    'São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador', 'Fortaleza', 'Belo Horizonte',
    'Manaus', 'Curitiba', 'Recife', 'Porto Alegre', 'Belém', 'Goiânia', 'Guarulhos',
    'Campinas', 'São Luís', 'São Gonçalo', 'Maceió', 'Duque de Caxias', 'Natal',
  ],
  'South Korea': [
    'Seoul', 'Busan', 'Incheon', 'Daegu', 'Daejeon', 'Gwangju', 'Suwon', 'Ulsan',
    'Changwon', 'Goyang', 'Yongin', 'Seongnam', 'Bucheon', 'Ansan', 'Jeonju',
  ],
  'Indonesia': [
    'Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Bekasi', 'Tangerang', 'Depok',
    'Semarang', 'Palembang', 'Makassar', 'South Tangerang', 'Batam', 'Pekanbaru',
    'Bandar Lampung', 'Padang', 'Malang', 'Denpasar', 'Balikpapan', 'Yogyakarta',
  ],
  'Mexico': [
    'Mexico City', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana', 'León', 'Juárez',
    'Zapopan', 'Nezahualcóyotl', 'Mérida', 'San Luis Potosí', 'Aguascalientes',
    'Querétaro', 'Morelia', 'Acapulco', 'Hermosillo', 'Chihuahua', 'Cancún',
  ],
  'Singapore': ['Singapore'],
  'New Zealand': [
    'Auckland', 'Wellington', 'Christchurch', 'Hamilton', 'Tauranga', 'Napier', 'Dunedin',
    'Palmerston North', 'Nelson', 'Rotorua', 'New Plymouth', 'Whangarei',
  ],
  'South Africa': [
    'Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Port Elizabeth', 'Bloemfontein',
    'East London', 'Nelspruit', 'Kimberley', 'Polokwane', 'Pietermaritzburg', 'Rustenburg',
  ],
  'Nigeria': [
    'Lagos', 'Kano', 'Ibadan', 'Abuja', 'Port Harcourt', 'Benin City', 'Maiduguri',
    'Zaria', 'Aba', 'Ilorin', 'Jos', 'Enugu', 'Kaduna', 'Onitsha',
  ],
  'United Arab Emirates': [
    'Dubai', 'Abu Dhabi', 'Sharjah', 'Al Ain', 'Ajman', 'Ras al-Khaimah', 'Fujairah',
    'Umm al-Quwain',
  ],
  'Saudi Arabia': [
    'Riyadh', 'Jeddah', 'Mecca', 'Medina', 'Dammam', 'Taif', 'Tabuk', 'Buraidah',
    'Khamis Mushait', 'Abha', 'Najran', 'Yanbu',
  ],
  'Malaysia': [
    'Kuala Lumpur', 'Subang Jaya', 'Johor Bahru', 'Ipoh', 'Petaling Jaya', 'Shah Alam',
    'Kota Kinabalu', 'Kuching', 'George Town', 'Malacca City', 'Alor Setar', 'Miri',
  ],
  'Thailand': [
    'Bangkok', 'Nonthaburi', 'Pak Kret', 'Hat Yai', 'Udon Thani', 'Chiang Mai', 'Phitsanulok',
    'Kalasin', 'Songkhla', 'Nakhon Ratchasima', 'Khon Kaen', 'Rayong',
  ],
  'Vietnam': [
    'Ho Chi Minh City', 'Hanoi', 'Da Nang', 'Haiphong', 'Bien Hoa', 'Hue', 'Nha Trang',
    'Can Tho', 'Rach Gia', 'Long Xuyen', 'Qui Nhon', 'Vung Tau', 'Nam Dinh', 'Buon Ma Thuot',
  ],
  'Pakistan': [
    'Karachi', 'Lahore', 'Faisalabad', 'Rawalpindi', 'Gujranwala', 'Peshawar', 'Multan',
    'Hyderabad', 'Islamabad', 'Quetta', 'Sialkot', 'Bahawalpur',
  ],
  'Italy': [
    'Rome', 'Milan', 'Naples', 'Turin', 'Palermo', 'Genoa', 'Bologna', 'Florence',
    'Bari', 'Catania', 'Venice', 'Verona', 'Messina', 'Padua', 'Trieste', 'Brescia',
  ],
  'Spain': [
    'Madrid', 'Barcelona', 'Valencia', 'Seville', 'Zaragoza', 'Málaga', 'Murcia',
    'Palma', 'Las Palmas', 'Bilbao', 'Alicante', 'Córdoba', 'Valladolid', 'Vigo',
    'Gijón', 'Granada', 'Elche', 'Hospitalet',
  ],
  'Turkey': [
    'Istanbul', 'Ankara', 'Izmir', 'Bursa', 'Adana', 'Gaziantep', 'Konya', 'Antalya',
    'Kayseri', 'Mersin', 'Eskişehir', 'Diyarbakır', 'Samsun', 'Denizli', 'Şanlıurfa',
  ],
  'Russia': [
    'Moscow', 'Saint Petersburg', 'Novosibirsk', 'Yekaterinburg', 'Kazan', 'Nizhny Novgorod',
    'Chelyabinsk', 'Samara', 'Omsk', 'Rostov-on-Don', 'Ufa', 'Krasnoyarsk', 'Voronezh',
  ],
  'Netherlands': [
    'Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven', 'Groningen', 'Tilburg',
    'Almere', 'Breda', 'Nijmegen', 'Enschede', 'Apeldoorn',
  ],
  'Belgium': [
    'Brussels', 'Antwerp', 'Ghent', 'Charleroi', 'Liège', 'Bruges', 'Namur', 'Leuven',
    'Mons', 'Aalst', 'Mechelen', 'La Louvière',
  ],
  'Sweden': [
    'Stockholm', 'Gothenburg', 'Malmö', 'Uppsala', 'Västerås', 'Örebro', 'Linköping',
    'Helsingborg', 'Jönköping', 'Norrköping', 'Lund', 'Umeå',
  ],
  'Switzerland': [
    'Zürich', 'Geneva', 'Basel', 'Bern', 'Lausanne', 'Winterthur', 'Lucerne',
    'St. Gallen', 'Lugano', 'Biel', 'Thun', 'Köniz',
  ],
  'Poland': [
    'Warsaw', 'Kraków', 'Łódź', 'Wrocław', 'Poznań', 'Gdańsk', 'Szczecin', 'Bydgoszcz',
    'Lublin', 'Katowice', 'Białystok', 'Gdynia', 'Częstochowa', 'Radom',
  ],
};

/** Dial codes keyed by country name */
export const DIAL_CODES: Record<string, string> = {
  'Afghanistan': '+93', 'Albania': '+355', 'Algeria': '+213', 'Andorra': '+376',
  'Angola': '+244', 'Argentina': '+54', 'Armenia': '+374', 'Australia': '+61',
  'Austria': '+43', 'Azerbaijan': '+994', 'Bahamas': '+1', 'Bahrain': '+973',
  'Bangladesh': '+880', 'Belarus': '+375', 'Belgium': '+32', 'Belize': '+501',
  'Benin': '+229', 'Bhutan': '+975', 'Bolivia': '+591', 'Bosnia and Herzegovina': '+387',
  'Botswana': '+267', 'Brazil': '+55', 'Brunei': '+673', 'Bulgaria': '+359',
  'Burkina Faso': '+226', 'Burundi': '+257', 'Cambodia': '+855', 'Cameroon': '+237',
  'Canada': '+1', 'Chad': '+235', 'Chile': '+56', 'China': '+86', 'Colombia': '+57',
  'Congo': '+242', 'Costa Rica': '+506', 'Croatia': '+385', 'Cuba': '+53',
  'Cyprus': '+357', 'Czech Republic': '+420', 'Denmark': '+45', 'Dominican Republic': '+1',
  'Ecuador': '+593', 'Egypt': '+20', 'El Salvador': '+503', 'Estonia': '+372',
  'Ethiopia': '+251', 'Finland': '+358', 'France': '+33', 'Georgia': '+995',
  'Germany': '+49', 'Ghana': '+233', 'Greece': '+30', 'Guatemala': '+502',
  'Guinea': '+224', 'Haiti': '+509', 'Honduras': '+504', 'Hungary': '+36',
  'Iceland': '+354', 'India': '+91', 'Indonesia': '+62', 'Iran': '+98', 'Iraq': '+964',
  'Ireland': '+353', 'Israel': '+972', 'Italy': '+39', 'Jamaica': '+1', 'Japan': '+81',
  'Jordan': '+962', 'Kazakhstan': '+7', 'Kenya': '+254', 'Kosovo': '+383',
  'Kuwait': '+965', 'Kyrgyzstan': '+996', 'Laos': '+856', 'Latvia': '+371',
  'Lebanon': '+961', 'Libya': '+218', 'Liechtenstein': '+423', 'Lithuania': '+370',
  'Luxembourg': '+352', 'Madagascar': '+261', 'Malaysia': '+60', 'Maldives': '+960',
  'Mali': '+223', 'Malta': '+356', 'Mexico': '+52', 'Moldova': '+373', 'Monaco': '+377',
  'Mongolia': '+976', 'Montenegro': '+382', 'Morocco': '+212', 'Mozambique': '+258',
  'Myanmar': '+95', 'Namibia': '+264', 'Nepal': '+977', 'Netherlands': '+31',
  'New Zealand': '+64', 'Nicaragua': '+505', 'Niger': '+227', 'Nigeria': '+234',
  'North Korea': '+850', 'North Macedonia': '+389', 'Norway': '+47', 'Oman': '+968',
  'Pakistan': '+92', 'Panama': '+507', 'Papua New Guinea': '+675', 'Paraguay': '+595',
  'Peru': '+51', 'Philippines': '+63', 'Poland': '+48', 'Portugal': '+351',
  'Qatar': '+974', 'Romania': '+40', 'Russia': '+7', 'Rwanda': '+250',
  'Saudi Arabia': '+966', 'Senegal': '+221', 'Serbia': '+381', 'Singapore': '+65',
  'Slovakia': '+421', 'Slovenia': '+386', 'Somalia': '+252', 'South Africa': '+27',
  'South Korea': '+82', 'South Sudan': '+211', 'Spain': '+34', 'Sri Lanka': '+94',
  'Sudan': '+249', 'Sweden': '+46', 'Switzerland': '+41', 'Syria': '+963',
  'Taiwan': '+886', 'Tajikistan': '+992', 'Tanzania': '+255', 'Thailand': '+66',
  'Timor-Leste': '+670', 'Togo': '+228', 'Trinidad and Tobago': '+1', 'Tunisia': '+216',
  'Turkey': '+90', 'Turkmenistan': '+993', 'Uganda': '+256', 'Ukraine': '+380',
  'United Arab Emirates': '+971', 'United Kingdom': '+44', 'United States': '+1',
  'Uruguay': '+598', 'Uzbekistan': '+998', 'Venezuela': '+58', 'Vietnam': '+84',
  'Yemen': '+967', 'Zambia': '+260', 'Zimbabwe': '+263',
};

/** Returns the cities for a given country, or an empty array if not curated. */
export function getCities(country: string): string[] {
  return CITIES_BY_COUNTRY[country] ?? [];
}

/** Returns the dial code for a country, or empty string. */
export function getDialCode(country: string): string {
  return DIAL_CODES[country] ?? '';
}

/** All unique dial codes sorted, deduplicated, formatted for display */
export interface DialCodeOption {
  country: string;
  code: string;
  label: string;
}

export const DIAL_CODE_OPTIONS: DialCodeOption[] = COUNTRY_NAMES.map((country) => ({
  country,
  code: DIAL_CODES[country] ?? '',
  label: `${DIAL_CODES[country] ?? ''} ${country}`,
})).filter((o) => o.code !== '');
