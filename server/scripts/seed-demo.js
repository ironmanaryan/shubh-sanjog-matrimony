// Demo seed script — creates 1 admin, 5 customers with canonical biodata
// fields, real (placeholder) private documents, and review workflow states.
// Usage: node server/scripts/seed-demo.js
const fs = require('fs');
const path = require('path');
const { init, createUser, upsertProfile, saveDocument } = require('../db');
const { store } = require('../data/store');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  const db = await init();

  const userSeed = [
    { identifier: 'admin@shubhsanjog.com', role: 'admin' },
    { identifier: 'neha.sharma@example.com', role: 'customer' },
    { identifier: 'aarohi.mehta@example.com', role: 'customer' },
    { identifier: 'rohan.kapoor@example.com', role: 'customer' },
    { identifier: 'zoya.khan@example.com', role: 'customer' },
    { identifier: 'karan.malhotra@example.com', role: 'customer' },
  ];

  const users = userSeed.map((user) => ({
    id: uuidv4(),
    identifier: user.identifier,
    role: user.role,
    createdAt: Date.now(),
  }));

  for (const user of users) {
    await createUser(db, user);
    store.users.set(user.id, user);
  }

  const customerUsers = users.filter((user) => user.role === 'customer');

  // Canonical field names matching the biodata schema (scope PDF §5-§6)
  const profileData = [
    {
      user: customerUsers[0], status: 'Approved',
      personal: { firstName: 'Neha', lastName: 'Sharma', gender: 'Female', dob: '1998-08-15', age: 27, height: '5ft 4in', weight: '54', religion: 'Hindu', caste: 'Brahmin', subCaste: '', motherTongue: 'Hindi', maritalStatus: 'Never Married', city: 'Delhi', state: 'Delhi', country: 'India', citizenship: 'Indian', nriStatus: false, manglikStatus: 'No', mobile: '9876543210', email: 'neha.sharma@example.com', foodPreference: 'Vegetarian', smoking: 'No', drinking: 'No', hobbies: 'Reading, Yoga', interests: 'Classical music', about: 'Calm, family-oriented software engineer.' },
      education: { highestQualification: 'B.Tech', educationDetails: 'Computer Science', profession: 'Software Engineer', jobType: 'Job', company: 'Infosys', annualIncome: '₹18L - ₹24L', workLocation: 'Delhi', experience: '5 years' },
      family: { fatherName: 'Rajesh Sharma', fatherOccupation: 'Businessman', motherName: 'Sunita Sharma', motherOccupation: 'Homemaker', numberOfBrothers: 1, numberOfSisters: 0, familyType: 'Nuclear', familyStatus: 'Middle Class', familyLocation: 'Delhi', otherInfo: '' },
      preferences: { preferredGender: 'Male', minAge: 26, maxAge: 30, minHeight: '5ft 7in', maxHeight: '6ft 2in', religion: 'Hindu', caste: 'Any', subCaste: '', motherTongue: 'Hindi', maritalStatus: 'Never Married', education: 'Post Graduate', profession: 'Any', incomeRange: '₹15L+', location: 'Delhi NCR', country: 'India', nriPreference: false, manglikPreference: 'No', lifestyle: 'Vegetarian family', foodPreference: 'Vegetarian', otherRequirements: '', aboutPartner: 'Looking for a kind, well-settled partner who values family.' },
    },
    {
      user: customerUsers[1], status: 'Approved',
      personal: { firstName: 'Aarohi', lastName: 'Mehta', gender: 'Female', dob: '1999-03-24', age: 27, height: '5ft 5in', weight: '52', religion: 'Hindu', caste: 'Maratha', motherTongue: 'Marathi', maritalStatus: 'Never Married', city: 'Mumbai', state: 'Maharashtra', country: 'India', citizenship: 'Indian', nriStatus: false, manglikStatus: "Don't Know", mobile: '9812345678', email: 'aarohi.mehta@example.com', foodPreference: 'Vegetarian', smoking: 'No', drinking: 'Occasionally', hobbies: 'Travel, Photography', interests: 'Design', about: 'Creative product manager who loves monsoon drives.' },
      education: { highestQualification: 'MBA', educationDetails: 'Marketing', profession: 'Product Manager', jobType: 'Job', company: 'TCS', annualIncome: '₹20L - ₹30L', workLocation: 'Mumbai', experience: '4 years' },
      family: { fatherName: 'Vinod Mehta', fatherOccupation: 'Doctor', motherName: 'Prerna Mehta', motherOccupation: 'Teacher', numberOfBrothers: 0, numberOfSisters: 1, familyType: 'Joint', familyStatus: 'Upper Middle Class', familyLocation: 'Mumbai', otherInfo: '' },
      preferences: { preferredGender: 'Male', minAge: 27, maxAge: 32, minHeight: '5ft 8in', maxHeight: '6ft 1in', religion: 'Hindu', caste: 'Any', subCaste: '', motherTongue: 'Marathi', maritalStatus: 'Never Married', education: 'Any', profession: 'Any', incomeRange: '₹18L+', location: 'Mumbai, Pune', country: 'India', nriPreference: true, manglikPreference: "Don't Know", lifestyle: '', foodPreference: 'No Preference', otherRequirements: '', aboutPartner: 'Ambitious yet grounded, with respect for traditions.' },
    },
    {
      user: customerUsers[2], status: 'Approved',
      personal: { firstName: 'Rohan', lastName: 'Kapoor', gender: 'Male', dob: '1995-11-09', age: 30, height: '5ft 11in', weight: '74', religion: 'Hindu', caste: 'Khatri', motherTongue: 'Hindi', maritalStatus: 'Never Married', city: 'Jaipur', state: 'Rajasthan', country: 'India', citizenship: 'Indian', nriStatus: false, manglikStatus: 'No', mobile: '9988776655', email: 'rohan.kapoor@example.com', foodPreference: 'Non-Vegetarian', smoking: 'Occasionally', drinking: 'Occasionally', hobbies: 'Cricket, Trekking', interests: 'Finance', about: 'CA by profession, trekker by passion.' },
      education: { highestQualification: 'CA', educationDetails: 'Chartered Accountancy', profession: 'Chartered Accountant', jobType: 'Job', company: 'Deloitte', annualIncome: '₹25L - ₹35L', workLocation: 'Jaipur', experience: '6 years' },
      family: { fatherName: 'Mahesh Kapoor', fatherOccupation: 'Businessman', motherName: 'Reena Kapoor', motherOccupation: 'Homemaker', numberOfBrothers: 0, numberOfSisters: 2, familyType: 'Nuclear', familyStatus: 'Affluent', familyLocation: 'Jaipur', otherInfo: '' },
      preferences: { preferredGender: 'Female', minAge: 24, maxAge: 29, minHeight: '5ft 2in', maxHeight: '5ft 9in', religion: 'Hindu', caste: 'Any', subCaste: '', motherTongue: 'Hindi', maritalStatus: 'Never Married', education: 'Graduate', profession: 'Any', incomeRange: 'Any', location: 'Jaipur, Delhi', country: 'India', nriPreference: false, manglikPreference: 'No', lifestyle: '', foodPreference: 'No Preference', otherRequirements: '', aboutPartner: 'Someone warm, independent and fun-loving.' },
    },
    {
      user: customerUsers[3], status: 'Submitted',
      personal: { firstName: 'Zoya', lastName: 'Khan', gender: 'Female', dob: '1997-01-18', age: 29, height: '5ft 3in', weight: '50', religion: 'Muslim', caste: '', subCaste: '', motherTongue: 'Urdu', maritalStatus: 'Never Married', city: 'Lucknow', state: 'Uttar Pradesh', country: 'India', citizenship: 'Indian', nriStatus: false, manglikStatus: 'No', mobile: '9765432109', email: 'zoya.khan@example.com', foodPreference: 'Non-Vegetarian', smoking: 'No', drinking: 'No', hobbies: 'Painting, Cooking', interests: 'Medicine', about: 'Doctor dedicated to community health.' },
      education: { highestQualification: 'MBBS', educationDetails: 'Medicine', profession: 'Doctor', jobType: 'Job', company: 'Apollo', annualIncome: '₹22L - ₹30L', workLocation: 'Lucknow', experience: '3 years' },
      family: { fatherName: 'Imran Khan', fatherOccupation: 'Engineer', motherName: 'Ayesha Khan', motherOccupation: 'Teacher', numberOfBrothers: 1, numberOfSisters: 0, familyType: 'Nuclear', familyStatus: 'Middle Class', familyLocation: 'Lucknow', otherInfo: '' },
      preferences: { preferredGender: 'Male', minAge: 25, maxAge: 30, minHeight: '5ft 7in', maxHeight: '6ft', religion: 'Muslim', caste: 'Any', subCaste: '', motherTongue: 'Urdu', maritalStatus: 'Never Married', education: 'Post Graduate', profession: 'Any', incomeRange: '₹15L+', location: 'Lucknow, Delhi', country: 'India', nriPreference: false, manglikPreference: 'No', lifestyle: '', foodPreference: 'Non-Vegetarian', otherRequirements: '', aboutPartner: 'Educated, respectful and family-oriented.' },
    },
    {
      user: customerUsers[4], status: 'Draft',
      personal: { firstName: 'Karan', lastName: 'Malhotra', gender: 'Male', dob: '1996-07-04', age: 30, height: '6ft', weight: '78', religion: 'Hindu', caste: 'Rajput', motherTongue: 'Punjabi', maritalStatus: 'Never Married', city: 'Chandigarh', state: 'Punjab', country: 'India', citizenship: 'Indian', nriStatus: false, manglikStatus: 'Yes', mobile: '9654321789', email: 'karan.malhotra@example.com' },
      education: { highestQualification: 'B.E.', educationDetails: 'Civil Engineering', profession: 'Civil Engineer', jobType: 'Job', company: 'L&T', annualIncome: '₹20L - ₹28L', workLocation: 'Chandigarh', experience: '7 years' },
      family: { fatherName: 'Vikram Malhotra', fatherOccupation: 'Army Officer', motherName: 'Neelam Malhotra', motherOccupation: 'Homemaker', numberOfBrothers: 0, numberOfSisters: 1, familyType: 'Joint', familyStatus: 'Middle Class', familyLocation: 'Chandigarh', otherInfo: '' },
      preferences: { preferredGender: 'Female', minAge: 24, maxAge: 28, minHeight: '5ft 3in', maxHeight: '5ft 10in', religion: 'Hindu', caste: 'Any', subCaste: '', motherTongue: 'Punjabi', maritalStatus: 'Never Married', education: 'Graduate', profession: 'Any', incomeRange: 'Any', location: 'Chandigarh, Delhi', country: 'India', nriPreference: false, manglikPreference: "Don't Know", lifestyle: '', foodPreference: 'No Preference', otherRequirements: '', aboutPartner: '' },
    },
  ];

  for (const item of profileData) {
    await upsertProfile(db, item.user.id, {
      personal: item.personal,
      education: item.education,
      family: item.family,
      preferences: item.preferences,
      status: item.status,
      submittedAt: item.status === 'Submitted' || item.status === 'Approved' ? Date.now() : null,
    });
    const persisted = await require('../db').getProfile(db, item.user.id);
    store.profiles.set(item.user.id, { userId: item.user.id, ...persisted });
  }

  // Real placeholder files inside private per-user upload folders
  const uploadsRoot = path.join(__dirname, '..', 'uploads', 'private');
  const documentSeed = [
    { user: customerUsers[0], name: 'neha_aadhaar.pdf', type: 'identity', status: 'Approved' },
    { user: customerUsers[0], name: 'neha_photo.jpg', type: 'photograph', status: 'Approved' },
    { user: customerUsers[1], name: 'aarohi_kundli.pdf', type: 'kundli', status: 'Pending Review' },
    { user: customerUsers[2], name: 'rohan_pan_card.pdf', type: 'identity', status: 'Rejected' },
    { user: customerUsers[3], name: 'zoya_address_proof.pdf', type: 'address', status: 'Pending Review' },
    { user: customerUsers[4], name: 'karan_photo.jpg', type: 'photograph', status: 'Pending Review' },
  ];

  for (const doc of documentSeed) {
    const dir = path.join(uploadsRoot, doc.user.id);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${Date.now()}-${doc.name}`);
    fs.writeFileSync(filePath, `Demo ${doc.type} document for ${doc.user.identifier}\n`);

    const id = uuidv4();
    const meta = {
      id,
      userId: doc.user.id,
      originalName: doc.name,
      path: filePath,
      mimetype: doc.name.endsWith('.jpg') ? 'image/jpeg' : 'application/pdf',
      size: Buffer.byteLength(`Demo ${doc.type} document for ${doc.user.identifier}\n`),
      uploadedAt: Date.now(),
      status: doc.status,
      rejectionReason: doc.status === 'Rejected' ? 'Document quality not clear' : null,
      documentType: doc.type,
    };
    await saveDocument(db, meta);
    store.documents.set(id, meta);
  }

  console.log('Seed complete');
  console.log('Admin user:', users.find((u) => u.role === 'admin').identifier);
  console.log('Customers:', customerUsers.map((u) => u.identifier).join(', '));
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
