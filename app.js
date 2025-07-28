
require('dotenv').config();

const express = require('express');



const session = require('express-session');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = JSON.parse(process.env.GOOGLE_SHEET_CREDENTIALS);




const { JWT } = require('google-auth-library');
const { error } = require('console');

const app = express();
const PORT = process.env.PORT || 3000;




app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('views'));
app.use('/uploads', express.static('uploads'));

app.use(session({
  secret: 'bfieubfefi1',
  resave: false,
  saveUninitialized: false
}));

// Routes
app.get('/', (req, res) => res.render('login', { error: null }));



app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/'); // adjust as needed
  });
});
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const token = 'sec@12jfl..idwh23';

  // Admin URL
  const adminUrl = `https://script.google.com/macros/s/AKfycbwvRTpJoTt0RDvpECOPz1-eFxbMXP_bKfrbB2aT-eMXhIb9aomuTY7aTjcrRu42bjiW/exec?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&token=${token}`;
  
  // Driver URL
  const driverUrl = `https://script.google.com/macros/s/AKfycbzqgu8vCz0VnA8DV3tqwT7IRjh9PT39IKTWR3JxIS8rVyeN0utmnnxHX6yUCUvCSKkg/exec?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&token=${token}`;

  try {
    // 1️⃣ Check Admin Login First
    const adminRes = await fetch(adminUrl);
    const adminData = await adminRes.json();

    if (adminData.success) {
      req.session.isAdminLoggedIn = true;
      req.session.username = username;
      return res.render('Admin_Dashboard', { username });
    }

    // 2️⃣ Check Driver Login
    const driverRes = await fetch(driverUrl);
    const driverData = await driverRes.json();

    if (driverData.success) {
      req.session.username = username;
      req.session.vehicleNumber = driverData.vehicle_number || 'Unknown';
      req.session.profilePhoto = driverData.profile_photo || null;
      req.session.leased = driverData.is_lease === 'Yes';

      if (req.session.leased) {
        return res.redirect('/leased-profile');
      } else {
        return res.redirect('/not-leased-profile');
      }
    }

    // ❌ Invalid for both
    res.render('login', { error: '❌ Invalid username or password' });

  } catch (error) {
    console.error('Login Error:', error);
    res.render('login', { error: '⚠️ Server error during login' });
  }
});


app.get('/leased-profile', (req, res) => {
  if (!req.session.username || !req.session.leased) return res.redirect('/');
  res.render('Lease_Driver_Profile', {
    username: req.session.username,
    vehicleNumber: req.session.vehicleNumber,
    isLeased: req.session.leased,
    profilePhoto: req.session.profilePhoto
  });
});

app.get('/not-leased-profile', (req, res) => {
  if (!req.session.username || req.session.leased) return res.redirect('/');
  res.render('Driver_Profile', {
    username: req.session.username,
    vehicleNumber: req.session.vehicleNumber,
     isLeased: req.session.leased,
    profilePhoto: req.session.profilePhoto
  });
});

app.get('/trip-form/before', (req, res) => {
  if (!req.session.username) return res.redirect('/');
  res.render('Before_start');
});

app.get('/trip-form/cng', (req, res) => {
  if (!req.session.username) return res.redirect('/');
  res.render('Filling_cng');
});

app.get('/trip-form/after', (req, res) => {
  if (!req.session.username) return res.redirect('/');
  res.render('After_end');
});

app.get('/trip-form', (req, res) => {
  if (!req.session.username || !req.session.leased) return res.redirect('/');
  res.render('trip_form', { error: null });
});

const storage = multer.diskStorage({
  destination: './uploads',
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({ storage });

// Google Sheet setup
const jwtClient = new JWT({
  email: creds.client_email,
  key: creds.private_key.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const doc = new GoogleSpreadsheet('17Bwt4UWx3cosXl0C0hxoF3-av2rrShmdhfbMky9IvOw', jwtClient);
const doc1 = new GoogleSpreadsheet('1B24jaWNjK0RMgrljn2evxlILOBbf7P-6awX_XYsBcG4', jwtClient);
const doc2 = new GoogleSpreadsheet('1GMrrR0go6VyVrot49hx-J22VwlWKoXE3npDl1oNzqPc', jwtClient);
// driver_data sheet
const doc3 = new GoogleSpreadsheet('1055AaVuJbiex-F-xxNXjPvCRCcG2ZgBeEAN5aLseZuU', jwtClient);

// Add row to sheet
async function addToSheet(reading, photoLink, username, vehicleNumber, date) {
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  await sheet.addRow({
    Date: date,
    Username: username,
    VehicleNumber: vehicleNumber,
    Reading: reading,
    Photo: photoLink
  });
  console.log('✅ Row added to sheet');
}

async function addToSheet1(cngQty, photoLink, username, vehicleNumber, date,reading,amount) {
  await doc1.loadInfo();
  const sheet = doc1.sheetsByIndex[0];
  await sheet.addRow({
    Date: date,
      Username: username,
      VehicleNumber: vehicleNumber,
      CNG_Quantity_KG: cngQty,
      Amount_Rs: amount,
      OdometerReading: reading,
      Photo: photoLink
  });
  console.log('✅ Row added to sheet');
}
async function addToSheet2(reading, photoLink, username, vehicleNumber, date) {
  await doc2.loadInfo();
  const sheet = doc2.sheetsByIndex[0];
  await sheet.addRow({
    Date: date,
    Username: username,
    VehicleNumber: vehicleNumber,
    Reading: reading,
    Photo: photoLink
  });
  console.log('✅ Row added to sheet');
}


app.get('/Before-start', (req, res) => {
  res.render('Before_start'); // or res.render(...) if using EJS
});

app.post('/Before-start', upload.single('photo'), async (req, res) => {
  if (!req.session.username) return res.redirect('/');

  const username = req.session.username;
  const vehicleNumber = req.session.vehicleNumber;
  const reading = req.body.reading;
  const fileName = req.file.filename;

 const baseURL = process.env.BASE_URL || `http://localhost:${PORT}`;
const photoLink = `${baseURL}/uploads/${fileName}`;

  const date = new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
    console.log('📤 Submitting to sheet:', {
    reading, photoLink, username, vehicleNumber, date
  });

  await addToSheet(reading, photoLink, username, vehicleNumber, date);
  res.redirect('/Before-start?success=true');
});
app.get('/Filling-cng', (req, res) => {
  res.render('Filling_cng'); // or res.render(...) if using EJS
});


app.post('/Filling-cng', upload.single('photo'), async (req, res) => {
  if (!req.session.username) return res.redirect('/');

  const username = req.session.username;
  const vehicleNumber = req.session.vehicleNumber;
  const cngQty = req.body.cngQty;
  const amount = req.body.amount;
  const reading = req.body.reading;
  const fileName = req.file.filename;
  const baseURL = process.env.BASE_URL || `http://localhost:${PORT}`;
const photoLink = `${baseURL}/uploads/${fileName}`;

  const date = new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });

  await addToSheet1(cngQty, photoLink, username, vehicleNumber, date,reading,amount);
  res.redirect('/Filling-cng?success=true');
});

app.get('/After-end', (req, res) => {
  res.render('After_end'); // or res.render(...) if using EJS
});
app.post('/After-end', upload.single('photo'), async (req, res) => {
  if (!req.session.username) return res.redirect('/');

  const username = req.session.username;
  const vehicleNumber = req.session.vehicleNumber;
  const reading = req.body.reading;
  const fileName = req.file.filename;
const baseURL = process.env.BASE_URL || `http://localhost:${PORT}`;
const photoLink = `${baseURL}/uploads/${fileName}`;



  const date = new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });

  await addToSheet2(reading, photoLink, username, vehicleNumber, date);
   res.redirect('/After-end?success=true');
});
app.get('/leased-drivers', async (req, res) => {
  try {
    await doc3.loadInfo();
    const sheet = doc3.sheetsByIndex[0];
    await sheet.loadHeaderRow(1);

    console.log('📌 Headers:', sheet.headerValues);

    const rows = await sheet.getRows();

    rows.forEach((row, i) => {
      console.log(`Row ${i + 1} raw:`, row._rawData);
    });

    const leasedDrivers = rows
      .filter(row => row._rawData[3]?.toLowerCase().trim() === 'yes')
      .map(row => ({
        username: row._rawData[0],
        vehicle: row._rawData[2],
        lease: row._rawData[3],
        photo: row._rawData[4]
      }));

    console.log('✅ Leased Drivers:', leasedDrivers);
    res.render('leased_drivers_list', { leasedDrivers });

  } catch (error) {
    console.error('❌ Error fetching leased drivers:', error);
    res.send('⚠️ Failed to load leased drivers.');
  }
});
app.get('/non-leased-drivers', async (req, res) => {
  try {
    await doc3.loadInfo();
    const sheet = doc3.sheetsByIndex[0];
    await sheet.loadHeaderRow(1);

    console.log('📌 Headers:', sheet.headerValues);

    const rows = await sheet.getRows();

    rows.forEach((row, i) => {
      console.log(`Row ${i + 1} raw:`, row._rawData);
    });

    const nonLeasedDrivers = rows
      .filter(row => row._rawData[3]?.toLowerCase().trim() === 'no')
      .map(row => ({
        username: row._rawData[0],
        vehicle: row._rawData[2],
        lease: row._rawData[3],
        photo: row._rawData[4]
      }));

    console.log('✅ Non-Leased Drivers:', nonLeasedDrivers);
    res.render('non_leased_drivers_list', { nonLeasedDrivers });

  } catch (error) {
    console.error('❌ Error fetching non-leased drivers:', error);
    res.send('⚠️ Failed to load non-leased drivers.');
  }
});




app.get('/admin-view-lease-driver-profile', async (req, res) => {
  const username = req.query.username;
  console.log(username);
  const token ='sec@12jfl..idwh23';

  // Call the Apps Script to get the user details
  const url = `https://script.google.com/macros/s/AKfycbzqgu8vCz0VnA8DV3tqwT7IRjh9PT39IKTWR3JxIS8rVyeN0utmnnxHX6yUCUvCSKkg/exec?username=${encodeURIComponent(username)}&token=${token}`;

  try {
    const response = await fetch(url);
    const result = await response.json();
    console.log(result)

    if (result.success) {
      res.render('Lease_Driver_Profile', {
        username: result.username,
        vehicleNumber: result.vehicle_number,
        isLeased: result.is_lease,
        profilePhoto: result.profile_photo || null
      });
    } else {
      res.send('❌ Driver not found or error fetching data.');
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.send('⚠️ Server error.');
  }
});

app.get('/admin-view-nonlease-driver-profile', async (req, res) => {
  const username = req.query.username;
  console.log(username);
  const token ='sec@12jfl..idwh23';

  // Call the Apps Script to get the user details
  const url = `https://script.google.com/macros/s/AKfycbzqgu8vCz0VnA8DV3tqwT7IRjh9PT39IKTWR3JxIS8rVyeN0utmnnxHX6yUCUvCSKkg/exec?username=${encodeURIComponent(username)}&token=${token}`;

  try {
    const response = await fetch(url);
    const result = await response.json();

    if (result.success) {
      res.render('Driver_Profile', {
        username: result.username,
        vehicleNumber: result.vehicle_number,
        isLeased: result.is_lease,
        profilePhoto: result.profile_photo || null
      });
    } else {
      res.send('❌ Driver not found or error fetching data.');
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.send('⚠️ Server error.');
  }
});









// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
