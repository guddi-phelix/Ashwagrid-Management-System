require('dotenv').config();


const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const {google}=require('googleapis');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = JSON.parse(process.env.GOOGLE_SHEET_CREDENTIALS);
const { JWT } = require('google-auth-library');
const { error } = require('console');
const mongoose = require('mongoose');
const dbURI = process.env.MONGO_URI;
  mongoose.connect(dbURI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

const app = express();
const PORT = process.env.PORT || 3000;



app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('views'));


app.use(session({
  secret: 'bfieubfefi1',
  resave: false,
  saveUninitialized: false,
   cookie: {
    maxAge: 3600000 // ← this controls session duration in milliseconds
  }
}));
//setup for drive image
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


// login  Routes
app.get('/', noCache,(req, res) => {
res.render('login', { error: null });
});
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});
function noCache(req, res, next) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
}

//image code for forms
const imageSchema = new mongoose.Schema({
  img: {
    data: Buffer,
    contentType: String
  },
  uploadedAt: { type: Date, default: Date.now } // optional: track upload time
});

const Image = mongoose.model("Image", imageSchema); 



app.get("/image/:id", async (req, res) => {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) return res.status(404).send("Image not found");

    res.set("Content-Type", image.img.contentType);
    res.send(image.img.data);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading image");
  }
});

// driver login route

app.post('/login', async (req, res) => {
  const { agdId, password } = req.body; 
  const token = 'sec@12jfl..idwh23';

  const driverUrl = `https://script.google.com/macros/s/AKfycbwzaR0vdDc4GyQzqzpH48DxIpv5pUDV4svwTQ__eaGtH_ju4_yDH52lSYfg32VrfEOP/exec?agdId=${encodeURIComponent(agdId)}&password=${encodeURIComponent(password)}&token=${token}`;

  try {
    const driverResult = await fetch(driverUrl);

    if (!driverResult.ok) {
      return res.render('login', { error: '⚠️ Unable to connect to server' });
    }

    const driverData = await driverResult.json();
    console.log(driverData);


    if (!driverData.success) {
      return res.render('login', { error: '❌ Invalid AGD ID or Password' });
    }

    // Store session data
    req.session.agdId = agdId;
    req.session.vehicleNumber = driverData.vehicle_number || 'Unknown';
    req.session.profilePhoto = driverData.profile_photo || null;
    req.session.username = driverData.username|| 'Unknown';
    // Get status & format exactly as in sheet (no lowercase)
    const status = driverData.status ? driverData.status.trim() : "";
    const format = driverData.format ? driverData.format.trim() : "";

    // ✅ Check conditions
    if (status === "login") {
      if (format === "Sub-Lease") {
        req.session.leased = true;
      return res.redirect('/leased-profile');
      } else {
        return res.redirect('/not-leased-profile');
      }
    } 
    else if (status === "logout") {
      return res.render('logout', { message: "You are logged out." });
    } 
    else if (status === "Block") {
      return res.render('block', { message: "You are blocked." });
    } 
    else if (status === "InActive") {
      return res.render('inactive', { message: "You are not active. Try again later." });
    } 
    else {
      return res.render('login', { error: "Unknown status." });
    }

  } catch (error) {
    console.error('Login Error:', error);
    res.render('login', { error: '⚠️ Server error during login' });
  }
});

app.get('/admin-dashboard', noCache,(req, res) => {
  if (!req.session.admin) {
    return res.redirect('/'); 
  }

  res.render('Admin_Dashboard', {
    username: req.session.admin
    
  });
});

// Admin login route
app.post('/admin', async (req, res) => {
  const SECRET_TOKEN = 'sec@12jfl..idwh23';
    try {
        const { username, password } = req.body;
        const admin = username;

        if (!username || !password) {
            return res.status(400).json({ success: false, error: "Missing credentials" });
        }

        // Call Apps Script API
        const url = `https://script.google.com/macros/s/AKfycbwvRTpJoTt0RDvpECOPz1-eFxbMXP_bKfrbB2aT-eMXhIb9aomuTY7aTjcrRu42bjiW/exec?token=${SECRET_TOKEN}&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
           req.session.admin = admin;
           console.log(req.session.admin)
            
           res.redirect('/admin-dashboard');
           
        } else {
            // ❌ Wrong credentials
            return res.status(401).json({ success: false, error: "Invalid username or password" });
        }
    } catch (err) {
        console.error("Error in /admin route:", err);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
});


app.get('/leased-profile',(req, res) => {
  
  if (!req.session.username || !req.session.leased) return res.redirect('/');

  res.redirect('/lease-driver-profile');
});

app.get('/lease-driver-profile', noCache,(req, res) => {
  if (!req.session.username || !req.session.leased) {
    return res.redirect('/');
  }

  const cleanPhoto = req.session.profilePhoto;
  res.render('Lease_Driver_Profile', {
    profilePhoto: cleanPhoto,
    username: req.session.username,
    agdId: req.session.agdId,
    vehicleNumber: req.session.vehicleNumber,
    isLeased: req.session.leased,
  });
});

app.get('/not-leased-profile',(req, res) => {
  if (!req.session.username || req.session.leased) return res.redirect('/');
  res.redirect('/driver-profile');
  
});
app.get('/driver-profile', noCache,(req, res) => {
  if (!req.session.username || req.session.leased) {
    return res.redirect('/');
  }
  const cleanPhoto = req.session.profilePhoto;
  res.render('Driver_Profile', {
    profilePhoto: cleanPhoto,
    username: req.session.username,
    agdId: req.session.agdId,
    vehicleNumber: req.session.vehicleNumber,
    isLeased: req.session.leased
  });
});

app.get('/trip-form/before',(req, res) => {
  if (!req.session.username) return res.redirect('/');
  res.render('Before_start');
});
app.get('/trip-form/cng',(req, res) => {
  if (!req.session.username) return res.redirect('/');
  res.render('Filling_cng');
});
app.get('/trip-form/after',(req, res) => {
  if (!req.session.username) return res.redirect('/');
  res.render('After_end');
});


app.get('/trip-form', (req, res) => {
  if (!req.session.username || !req.session.leased) return res.redirect('/');
  res.render('trip_form', { error: null });
});


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
const doc3 = new GoogleSpreadsheet('1055AaVuJbiex-F-xxNXjPvCRCcG2ZgBeEAN5aLseZuU', jwtClient);//car history
const doc5 = new GoogleSpreadsheet('1BjaACtElpoediYDcMZ1DJPX8G4bZKa6KYMbjB6mPUpw', jwtClient); //total os
const doc6 = new GoogleSpreadsheet('1QCP9Hj4Hc1EkZeFdSZeHOnot5bzCEH0MC_o3p7sSuiE', jwtClient);//daily accounts
const doc7 = new GoogleSpreadsheet('11w-Oc5Dc27kX5B67_VztGfJUafkfiDcVLo_NA3az5qU', jwtClient);//driver ids
const doc8 = new GoogleSpreadsheet('1qZY44oiGylNUUCspqH7d7PWInKxZvNtmvLPWiAzsMdo', jwtClient);

async function addToSheet(reading, photoLink, username, vehicleNumber, date) {
  await doc.loadInfo(); // load spreadsheet info
  const sheet = doc.sheetsByIndex[0]; // first sheet
  await sheet.addRow({
    Date: date,
    Username: username,
    VehicleNumber: vehicleNumber,
    Reading: reading,
    Photo: photoLink,
  });
  console.log("✅ Row added to sheet");
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

app.get('/before_start', (req, res) => {
   if (!req.session.username) {
    return res.redirect('/'); }
  res.render('Before_start'); // or res.render(...) if using EJS
});

app.post("/before_start", upload.single("file"), async (req, res) => {
  if (!req.session.username) return res.redirect('/');
  const { reading } = req.body;

  try {
    const username = req.session.username;
    const vehicleNumber = req.session.vehicleNumber;

    // ===== Upload image to MongoDB using global Image model =====
    const newImage = new Image({
      img: {
        data: req.file.buffer,
        contentType: req.file.mimetype
      }
    });

    const savedImage = await newImage.save();

    // ===== Generate public link =====
    const baseUrl = req.protocol + '://' + req.get('host');
    const photoLink = `${baseUrl}/image/${savedImage._id}`;

    // ===== Format current date =====
    const date = new Date().toLocaleString('en-IN', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });

    // ===== Add row to Google Sheet =====
    await addToSheet(reading, photoLink, username, vehicleNumber, date);

    res.redirect("submit-page");

  } catch (err) {
    console.error("Upload error:", err);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).send("Upload failed. Check server logs.");
  }
});


app.get('/submit-page', (req, res) => {
   if (!req.session.username) {
    return res.redirect('/'); }
  res.render('submit_page'); // or res.render(...) if using EJS
});
app.post("/Filling-cng", upload.single("file"), async (req, res) => {
  if (!req.session.username) return res.redirect("/");

  try {
    const username = req.session.username;
    const vehicleNumber = req.session.vehicleNumber;
    const { cngQty, amount, reading } = req.body;

    // ===== Upload photo to MongoDB =====
    const newImage = new Image({
      img: {
        data: req.file.buffer,
        contentType: req.file.mimetype
      }
    });

    const savedImage = await newImage.save();

    // ===== Generate public link =====
    const baseUrl = req.protocol + "://" + req.get("host");
    const photoLink = `${baseUrl}/image/${savedImage._id}`;

    // ===== Format current date (Indian style) =====
    const date = new Date().toLocaleString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    // ===== Save record to Google Sheet =====
    await addToSheet1(cngQty, photoLink, username, vehicleNumber, date, reading, amount);

    // ===== Show success page with link =====
    res.render("submit_page", {
      message: `✅ CNG filling record saved! <a href="${photoLink}" target="_blank">View Image</a>`,
      backLink: "/",
    });

  } catch (err) {
    console.error("Upload error in /Filling-cng:", err);

    // Clean up temp file if exists
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    res.status(500).send("❌ Failed to save CNG record. Check server logs.");
  }
});



app.get('/After-end', (req, res) => {
   if (!req.session.username) {
    return res.redirect('/'); }
  res.render('After_end'); // or res.render(...) if using EJS
});

app.post("/After-end", upload.single("file"), async (req, res) => {
  if (!req.session.username) return res.redirect('/');
  const { reading } = req.body;

  try {
    const username = req.session.username;
    const vehicleNumber = req.session.vehicleNumber;

    // ===== Upload photo to MongoDB using global Image model =====
    const newImage = new Image({
      img: {
        data: req.file.buffer,
        contentType: req.file.mimetype
      }
    });

    const savedImage = await newImage.save();

    // ===== Generate public link =====
    const baseUrl = req.protocol + "://" + req.get("host");
    const photoLink = `${baseUrl}/image/${savedImage._id}`;

    // ===== Format current date (Indian style) =====
    const date = new Date().toLocaleString('en-IN', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });

    // ===== Add row to Google Sheet =====
    await addToSheet2(reading, photoLink, username, vehicleNumber, date);

    // ===== Show success page with link =====
    res.render("submit_page", {
      message: `✅ File successfully uploaded! <a href="${photoLink}" target="_blank">View Image</a>`,
      backLink: "/",
    });

  } catch (err) {
    console.error("Upload error in /After-end:", err);

    // Clean up temp file if exists
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    res.status(500).send("Upload failed. Check server logs.");
  }
});

// Total OS Route
app.get('/Total_os', async (req, res) => {
    if (!req.session.admin) {
    return res.redirect('/'); 
  }
  try {
    await doc5.loadInfo();
    const sheet = doc5.sheetsByIndex[0];
    await sheet.loadHeaderRow(1);

    const rows = await sheet.getRows();

    const totalos = rows.map(row => ({
      WhatsApp_Number:row._rawData[0],
      Uber_Registered_Number:row._rawData[1],
      Name: row._rawData[2],
       AGD_ID:row._rawData[3],
      Weekly_OS:row._rawData[4],
      Daily_Hisaab:row._rawData[5],
       Total_OS:row._rawData[6]
    
    }));
    res.render('Total_os', { totalos, layout: false }); // 🔁 use short version + layout: false

  } catch (error) {
    console.error('❌ Error fetching leased drivers:', error);
    res.send('⚠️ Failed to load leased drivers.');
  }
});



// Daily accounts
app.get('/Daily_accounts', async (req, res) =>  { 
  if (!req.session.admin) {
    return res.redirect('/'); }
  try {
    await doc6.loadInfo();
    const sheet = doc6.sheetsByIndex[0];
    await sheet.loadHeaderRow(1);

    const rows = await sheet.getRows();

    const Daily_accounts = rows.map(row => ({
      AGD_ID:row._rawData[0],
      Driver_Name:row._rawData[1],
      Assigned_Car: row._rawData[2],
      Date:row._rawData[3],
      Cash_Collection:row._rawData[4],
      Login_hours:row._rawData[5],
      Toll:row._rawData[6],
      CNG: row._rawData[7],
      Driver_salary:row._rawData[8],
      RTO:row._rawData[9],
      Adjustment:row._rawData[10],
      payable_amt:row._rawData[11],
      Paid_amt:row._rawData[12],
      Rent:row._rawData[13],
      Rent_to_deposit:row._rawData[14],
      deposit_to_rent:row._rawData[15]
    
    }));
    console.log(Daily_accounts)
    res.render('Daily_accounts', { Daily_accounts, layout: false }); // 🔁 use short version + layout: false

  } catch (error) {
    console.error('❌ Error fetching leased drivers:', error);
    res.send('⚠️ Failed to load leased drivers.');
  }

});


app.get('/Weekly_accounts', async (req, res) => {
   if (!req.session.admin) {
    return res.redirect('/'); }
  try {
    await doc6.loadInfo();
    const sheet = doc6.sheetsByIndex[0];
    await sheet.loadHeaderRow(1);

    const rows = await sheet.getRows();

    const Weekly_accounts = rows.map(row => ({
      Driver_ID:row._rawData[0],
      Assigned_Car: row._rawData[2],
      Week_Start:row._rawData[3],
      Week_End:row._rawData[3],
      Cash_Collection:row._rawData[4],
      Login_hours:row._rawData[5],
      Toll:row._rawData[6],
      CNG: row._rawData[7],
      Driver_salary:row._rawData[8],
      Adjustment:row._rawData[10],
      Final_amt:row._rawData[11],
      Status:row._rawData[12],
    
    }));
    console.log(Weekly_accounts)
    res.render('Weekly_accounts', { Weekly_accounts, layout: false }); // 🔁 use short version + layout: false

  } catch (error) {
    console.error('❌ Error fetching leased drivers:', error);
    res.send('⚠️ Failed to load leased drivers.');
  }
});
// driver ids
app.get('/Driver_ids', async (req, res) => {
   if (!req.session.admin) {
    return res.redirect('/'); }
  try {
    await doc7.loadInfo();

    // Read sheet 1 (main driver data)
    const sheet1 = doc7.sheetsByIndex[0];
    await sheet1.loadHeaderRow(1);
    const rows1 = await sheet1.getRows();

    // Read sheet 2 (extra 2 columns)
    const sheet2 = doc7.sheetsByIndex[1];
    await sheet2.loadHeaderRow(1);
    const rows2 = await sheet2.getRows();

    // Merge sheet1 and sheet2 by index
    const Driver_ids = rows1.map((row, index) => {
      const extraData = rows2[index] || {}; // in case sheet2 has fewer rows
      return {
        UUID: row._rawData[0],
        AGD_ID: row._rawData[1],
        Recruited_From: row._rawData[2],
        AGD_ID_of_referee: row._rawData[3],
        Relation: row._rawData[4],
        Contact_Number: row._rawData[5],
        Driver_Name_in_Uber: row._rawData[6],
        WhatsApp_Number: row._rawData[7],
        Uber_Registered_Mobile_Number: row._rawData[8],
        Alternate_Contact_Number: row._rawData[9],
        Emergency_Contact_Number: row._rawData[10],
        Name_of_Emergency_Contact: row._rawData[11],
        Relation_with_Emergency_Contact: row._rawData[12],
        Present_Address: row._rawData[13],
        Permanent_Address: row._rawData[14],
        Age_of_Driver: row._rawData[15],
        Marital_Status: row._rawData[16],
        Selfie: row._rawData[17],
        Aadhar_Card_Number: row._rawData[18],
        Aadhar_Card_Front: row._rawData[19],
        Aadhar_Card_Back: row._rawData[20],
        Driving_License_Number: row._rawData[21],
        Driving_License_Front: row._rawData[22],
        Driving_License_Back: row._rawData[23],
        Pan_Card_Number: row._rawData[24],
        Pan_Card: row._rawData[25],

        // Data from sheet 2 (same row index)
        House_Rented_or_Owned: extraData._rawData ? extraData._rawData[0] : '',
        Electricity_Bill: extraData._rawData ? extraData._rawData[1] : ''
      };
    });

    console.log(Driver_ids);
    res.render('Driver_ids', { Driver_ids, layout: false });

  } catch (error) {
    console.error('❌ Error fetching driver IDs:', error);
    res.send('⚠️ Failed to load driver IDs.');
  }
});
//car history
app.get('/Car_History', async (req, res) => {
   if (!req.session.admin) {
    return res.redirect('/'); }
  try {
    await doc3.loadInfo();
    const sheet = doc3.sheetsByIndex[0];
    await sheet.loadHeaderRow(1);

    const rows = await sheet.getRows();

    const Car_History = rows.map(row => ({
      Allocation_ID:row._rawData[0],
      Car_Number: row._rawData[1],
      Car_Type:row._rawData[2],
      AGD_ID:row._rawData[3],
      Driver_Name:row._rawData[4],
     Format: row._rawData[5] === "Sub-Lease" ? "Lease" : row._rawData[5],
      Date_From:row._rawData[6],
      Date_To: row._rawData[7],
      Total_Days:row._rawData[8],
      UUID:row._rawData[9],
      photo:row._rawData[10]
    }));
    console.log(Car_History)
    res.render('Car_History', { Car_History, layout: false }); // 🔁 use short version + layout: false

  } catch (error) {
    console.error('❌ Error fetching leased drivers:', error);
    res.send('⚠️ Failed to load leased drivers.');
  }
});


// Lease Drivers Route
app.get('/leased-drivers', async (req, res) => {
   if (!req.session.admin) {
    return res.redirect('/'); }
  try {
    await doc3.loadInfo();
    const sheet = doc3.sheetsByIndex[0];
    await sheet.loadHeaderRow(1);

    const rows = await sheet.getRows();

    const leasedDrivers = rows
      .filter(row => row._rawData[5]?.toLowerCase().trim() === 'sub-lease')
      .map(row => ({
        username: row._rawData[4],
        vehicle: row._rawData[1],
        lease: row._rawData[5],
        photo: row._rawData[10]
      }));

    res.render('leased_drivers_list', { leasedDrivers, layout: false }); // 🔁 use short version + layout: false

  } catch (error) {
    console.error('❌ Error fetching leased drivers:', error);
    res.send('⚠️ Failed to load leased drivers.');
  }
});

// Non-Lease Drivers Route
app.get('/non-leased-drivers', async (req, res) => {
   if (!req.session.admin) {
    return res.redirect('/'); }
  try {
    await doc3.loadInfo();
    const sheet = doc3.sheetsByIndex[0];
    await sheet.loadHeaderRow(1);

    const rows = await sheet.getRows();

    const nonLeasedDrivers = rows
      .filter(row => row._rawData[5]?.toLowerCase().trim() !== 'sub-lease')
      .map(row => ({
         username: row._rawData[4],
        vehicle: row._rawData[1],
        lease: row._rawData[5],
        photo: row._rawData[10]
      }));

    res.render('non_leased_drivers_list', { nonLeasedDrivers, layout: false }); // 🔁 short version + layout: false

  } catch (error) {
    console.error('❌ Error fetching non-leased drivers:', error);
    res.send('⚠️ Failed to load non-leased drivers.');
  }
});




app.get('/admin-view-lease-driver-profile',async (req, res) => {
   if (!req.session.admin) {
    return res.redirect('/'); }
  const username = req.query.username;
  console.log(username)
  const token ='sec@12jfl..idwh23';

  // Call the Apps Script to get the user details
  const url = `https://script.google.com/macros/s/AKfycbwzaR0vdDc4GyQzqzpH48DxIpv5pUDV4svwTQ__eaGtH_ju4_yDH52lSYfg32VrfEOP/exec?username=${encodeURIComponent(username)}&token=${token}`;

  try {
    const response = await fetch(url);
    const result = await response.json();
    console.log(result)
    console.log(result.agd_id)

    if (result.success) {
      res.render('Lease_Driver_Profile', {
        username: result.username,
        agdId:result.agd_id,
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
   if (!req.session.admin) {
    return res.redirect('/'); }
  const username = req.query.username;
  const token ='sec@12jfl..idwh23';

  // Call the Apps Script to get the user details
  const url = `https://script.google.com/macros/s/AKfycbwzaR0vdDc4GyQzqzpH48DxIpv5pUDV4svwTQ__eaGtH_ju4_yDH52lSYfg32VrfEOP/exec?username=${encodeURIComponent(username)}&token=${token}`;

  try {
    const response = await fetch(url);
    const result = await response.json();

    if (result.success) {
      res.render('Driver_Profile', {
        username: result.username,
        vehicleNumber: result.vehicle_number,
        agdId:result.agd_id,
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


// Route to get data for a specific driver
app.get('/driver_daily_accounts', async (req, res) => {
  if (!req.session.username) {
    return res.redirect('/'); }
  try {
    const username = req.session.username ? req.session.username.trim() : ''; // Get logged-in driver's username
    console.log("user",username)
    if (!username) {
      return res.redirect('/'); // if not logged in
    }
  
    await doc6.loadInfo();
    const sheet = doc6.sheetsByIndex[0];
    await sheet.loadHeaderRow(1);

    const rows = await sheet.getRows();
    console.log(rows)
    // Filter only the data of this user
    const driverData = rows
      .filter(row => row._rawData[1] === username) // Driver_Name in index 1
      .map(row => ({
        AGD_ID: row._rawData[0],
        Driver_Name: row._rawData[1],
        Assigned_Car: row._rawData[2],
        Date: row._rawData[3],
        Cash_Collection: row._rawData[4],
        Login_hours: row._rawData[5],
        Toll: row._rawData[6],
        CNG: row._rawData[7],
        Driver_salary: row._rawData[8],
        RTO: row._rawData[9],
        Adjustment: row._rawData[10],
        payable_amt: row._rawData[11],
        Paid_amt: row._rawData[12],
        Rent: row._rawData[13],
        Rent_to_deposit: row._rawData[14],
        deposit_to_rent: row._rawData[15],
      }));
    console.log("data:",driverData)
    res.render('driver_daily_account', { driverData, layout: false });

  } catch (error) {
    console.error('❌ Error fetching driver data:', error);
    res.send('⚠️ Failed to load driver data.');
  }
});

// Route to get data for a specific driver
app.get('/variable-performance', async (req, res) => {
   if (!req.session.username) {
    return res.redirect('/'); }
  try {
    const vehicleNumber = req.session.vehicleNumber; // Get logged-in driver's username
    console.log("user",vehicleNumber)
    if (!vehicleNumber) {
      return res.redirect('/'); // if not logged in
    }
  
    await doc8.loadInfo();
    const sheet = doc8.sheetsByIndex[0];
    await sheet.loadHeaderRow(1);

    const rows = await sheet.getRows();
    
    // Filter only the data of this user
    const driverData = rows
      .filter(row => row._rawData[2] === vehicleNumber) // Driver_Name in index 1
      .map(row => ({
        Date_from: row._rawData[0],
        Date_to: row._rawData[1],
        Car_number: row._rawData[2],
        Due_amount: row._rawData[3],
        Uber_trips: row._rawData[4],
        Acceptance_rate: row._rawData[5],
        Cancellation_rate: row._rawData[6],
        Total_lease: row._rawData[7],
        Total_earning: row._rawData[8],
        Total_toll: row._rawData[9],
        Comapany_penality: row._rawData[10],
        RTO_fine: row._rawData[11],
        TDS: row._rawData[12],
        Adjustment: row._rawData[13],
        Payment_made: row._rawData[14],
      }));
    console.log("data:",driverData)
    res.render('Variable_performace', { driverData, layout: false });

  } catch (error) {
    console.error('❌ Error fetching driver data:', error);
    res.send('⚠️ Failed to load driver data.');
  }
});




// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
