/** Indian states and major cities (alphabetical within each state). */

const STATE_CITIES = {
  "Andaman and Nicobar Islands": ["Port Blair"],
  "Andhra Pradesh": ["Amaravati", "Guntur", "Kurnool", "Tirupati", "Vijayawada", "Visakhapatnam"],
  "Arunachal Pradesh": ["Itanagar", "Naharlagun", "Pasighat", "Tawang"],
  Assam: ["Dibrugarh", "Guwahati", "Jorhat", "Silchar", "Tezpur"],
  Bihar: ["Arrah", "Begusarai", "Bhagalpur", "Darbhanga", "Gaya", "Muzaffarpur", "Patna", "Purnia"],
  Chandigarh: ["Chandigarh"],
  Chhattisgarh: ["Bhilai", "Bilaspur", "Durg", "Korba", "Raipur"],
  "Dadra and Nagar Haveli and Daman and Diu": ["Daman", "Diu", "Silvassa"],
  Delhi: ["Central Delhi", "East Delhi", "New Delhi", "North Delhi", "South Delhi", "West Delhi"],
  Goa: ["Margao", "Panaji", "Vasco da Gama"],
  Gujarat: ["Ahmedabad", "Gandhinagar", "Jamnagar", "Rajkot", "Surat", "Vadodara"],
  Haryana: ["Ambala", "Faridabad", "Gurugram", "Hisar", "Karnal", "Panipat", "Rohtak"],
  "Himachal Pradesh": ["Dharamshala", "Kullu", "Manali", "Shimla", "Solan"],
  "Jammu and Kashmir": ["Anantnag", "Baramulla", "Jammu", "Srinagar", "Udhampur"],
  Jharkhand: ["Bokaro", "Deoghar", "Dhanbad", "Jamshedpur", "Ranchi"],
  Karnataka: ["Ballari", "Belagavi", "Bengaluru", "Hubballi", "Mangaluru", "Mysuru"],
  Kerala: ["Kochi", "Kollam", "Kozhikode", "Thiruvananthapuram", "Thrissur"],
  Ladakh: ["Kargil", "Leh"],
  Lakshadweep: ["Kavaratti"],
  "Madhya Pradesh": ["Bhopal", "Gwalior", "Indore", "Jabalpur", "Ratlam", "Ujjain"],
  Maharashtra: ["Aurangabad", "Kolhapur", "Mumbai", "Nagpur", "Nashik", "Pune", "Thane"],
  Manipur: ["Bishnupur", "Imphal", "Thoubal"],
  Meghalaya: ["Shillong", "Tura"],
  Mizoram: ["Aizawl", "Lunglei"],
  Nagaland: ["Dimapur", "Kohima"],
  Odisha: ["Balasore", "Berhampur", "Bhubaneswar", "Cuttack", "Rourkela", "Sambalpur"],
  Puducherry: ["Karaikal", "Puducherry"],
  Punjab: ["Amritsar", "Bathinda", "Jalandhar", "Ludhiana", "Mohali", "Patiala"],
  Rajasthan: ["Ajmer", "Bikaner", "Jaipur", "Jodhpur", "Kota", "Udaipur"],
  Sikkim: ["Gangtok", "Namchi"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Salem", "Tiruchirappalli", "Tirunelveli"],
  Telangana: ["Hyderabad", "Karimnagar", "Khammam", "Nizamabad", "Warangal"],
  Tripura: ["Agartala", "Dharmanagar"],
  "Uttar Pradesh": ["Agra", "Aligarh", "Ghaziabad", "Kanpur", "Lucknow", "Meerut", "Noida", "Varanasi"],
  Uttarakhand: ["Dehradun", "Haridwar", "Haldwani", "Rishikesh", "Roorkee"],
  "West Bengal": ["Asansol", "Bardhaman", "Durgapur", "Howrah", "Kolkata", "Siliguri"],
};

export const INDIAN_STATES = Object.keys(STATE_CITIES).sort((a, b) => a.localeCompare(b));

export function getCitiesForState(state) {
  const list = STATE_CITIES[state];
  if (!list) return [];
  return [...list].sort((a, b) => a.localeCompare(b));
}

export function isValidCityForState(state, city) {
  if (!state || !city) return false;
  return getCitiesForState(state).includes(city);
}
