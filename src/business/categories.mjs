const subcategory = label => ({
  id: label.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
  label,
});

const category = (id, label, icon, subcategories) => ({ id, label, icon, subcategories: subcategories.map(subcategory) });

export const BUSINESS_CATEGORIES = [
  category('food', 'Food & Catering', '\u{1F37D}\uFE0F', ['Restaurants & Cafes', 'Home Kitchens', 'Catering', 'Niaz Preparation and supply', 'Bakeries & Desserts', 'Groceries & Specialty Foods', 'Halal Meat & Butchers', 'Food Trucks', 'Beverages', 'Meal Preparation']),
  category('events', 'Events & Celebrations', '\u{1F389}', ['Event Planning', 'Venues & Function Centres', 'Photography & Videography', 'Decorations & Styling', 'Florists', 'Sound, Lighting & AV', 'Entertainment, DJs & MCs', 'Invitations, Printing & Signage', 'Marquee, Furniture & Equipment Hire', 'Wedding Services']),
  category('retail', 'Retail & Fashion', '\u{1F6CD}\uFE0F', ['Clothing & Fashion', 'Modest Fashion & Hijab', 'Tailoring & Alterations', 'Footwear & Accessories', 'Jewellery & Watches', 'Beauty, Cosmetics & Fragrances', 'Gifts & Homewares', 'Books & Religious Goods', 'General Retail', 'Online Stores']),
  category('professional', 'Professional Services', '\u{1F4BC}', ['Accounting, Bookkeeping & Tax', 'Legal Services', 'Justice of the Peace (JP) Services', 'Finance & Mortgage Brokers', 'Insurance', 'Real Estate', 'Business Consulting', 'Marketing & Branding', 'Human Resources & Recruitment', 'Translation & Interpreting', 'Administration & Virtual Assistance']),
  category('health', 'Health & Wellness', '\u{1FA7A}', ['General Practice & Medical', 'Dental', 'Pharmacy', 'Physiotherapy & Rehabilitation', 'Psychology & Counselling', 'Optometry', 'Nutrition & Dietetics', 'Fitness & Personal Training', 'Allied Health', 'Aged, Disability & Home Care', 'Personal Care & Grooming']),
  category('education', 'Education', '\u{1F393}', ['Early Childhood & Childcare', 'Primary & Secondary Tutoring', 'Quran & Islamic Education', 'Languages', 'Vocational & Trade Training', 'University & Higher Education Support', 'Music & Arts', 'Driving Schools', 'Online Courses', 'Special Learning Support']),
  category('home', 'Home Services', '\u{1F6E0}\uFE0F', ['Cleaning', 'Gardening & Lawn Care', 'Pest Control', 'Handyman & Minor Repairs', 'Appliance Repair', 'Locksmiths & Security', 'Removalists & Storage', 'Property Maintenance', 'Pool Services', 'Home Organisation']),
  category('automotive', 'Automotive', '\u{1F697}', ['Mechanical Repairs & Servicing', 'Tyres & Wheels', 'Auto Electrical', 'Panel Beating & Paint', 'Car Wash & Detailing', 'Roadside Assistance & Towing', 'Parts & Accessories', 'Vehicle Sales', 'Vehicle Rental', 'Inspections', 'Motorcycles']),
  category('construction', 'Construction & Builders', '\u{1F3D7}\uFE0F', ['Residential Builders', 'Commercial Builders', 'Renovations & Extensions', 'Architects & Building Designers', 'Engineering & Surveying', 'Project Management', 'Carpentry & Joinery', 'Plumbing, Electrical & HVAC', 'Roofing & Gutters', 'Concreting, Bricklaying & Masonry', 'Tiling, Flooring, Painting & Plastering', 'Demolition, Excavation & Waterproofing']),
  category('technology', 'Technology', '\u{1F4BB}', ['IT Support & Managed Services', 'Software & App Development', 'Website & E-commerce Development', 'Cybersecurity', 'Cloud, Networking & Infrastructure', 'Data, AI & Automation', 'Telecommunications', 'Computers, Devices & Repairs', 'Business Systems & Point of Sale', 'CCTV, Security & Smart Home', 'Technology Consulting & Training']),
];
