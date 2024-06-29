const bcrypt = require('bcryptjs');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const { UserModel, DoctorModel, AppointmentModel } = require('./config/database');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
require('dotenv').config();


app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_ATLAS, collectionName: "sessions" }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24
    }
}));

require('./config/passport');

app.use(passport.initialize());
app.use(passport.session());


const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

const client = twilio(accountSid, authToken);

const sendWhatsAppMessage = async (to, body) => {
    try {

        const message = await client.messages.create({
            from: 'whatsapp:+14155238886', // Your Twilio WhatsApp number
            to: `whatsapp:${to}`, // Recipient's WhatsApp number
            body: body
        });
        console.log('Message sent:', message.sid);
    } catch (error) {
        console.error('Error sending message:', error);
    }
};


const sendEmail = (to, subject, text) => {
    let transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  
    let mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: subject,
      text: text
    };
  
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log("Error sending email:", error);
      } else {
        console.log("Email sent successfully:", info.response);
      }
    });
  };
  



const isAuthenticated = (req, res, next) => {
    if (req.session.username) {
        console.log('Session data:', req.session);
        next();
    } else {
        
        res.redirect('/login');
    }
};




app.get('/', (req, res) => {
    res.render("index");
});

app.get('/signup', (req, res) => {
    res.render("signup");
});

app.get('/login', (req, res) => {
    res.render("login");
});

app.get('/appointment/:doctor', isAuthenticated, (req, res) => {
    const doctor = req.params.doctor;
    res.render("appointment", { doctor: doctor });
});

app.get('/dashboard-patient', isAuthenticated, async (req, res) => {
    try {
        const doctors = await DoctorModel.find({});
        const appointments = await AppointmentModel.find({ patientUsername: req.session.username });
        
        res.render("dashboard", { appointments: appointments, doctors: doctors, user:req.session });
    } catch (err) {
        console.error("Error fetching appointments:", err);
    }
});

app.get('/dashboard-doctor', isAuthenticated, async (req, res) => {
    try {
        const patient = await UserModel.find({});
        const appointments = await AppointmentModel.find({ doctorUsername: req.session.username });
        
        res.render("dashboard-doctor", { appointments: appointments, patient: patient, user:req.session });
    } catch (err) {
        console.error("Error fetching appointments:", err);
    }
});



app.get('/video-call/:roomId', isAuthenticated, (req, res) => {
    const roomId=req.params.roomId;
    const user=req.session;
    res.render('video-call',{roomId: roomId, user: user});
});


app.get('/doctor', isAuthenticated, async (req, res) => {
    try {
        const doctors = await DoctorModel.find({});
        console.log('Doctors fetched successfully:', doctors);
        res.render("doctor", { doctors: doctors });
    } catch (err) {
        console.error('Error fetching doctors:', err);
        res.status(500).json({ error: 'Error fetching doctors' });
    }
});

app.post('/signup', async (req, res) => {
    let users = new UserModel({
        username: req.body.username,
        name: req.body.name,
        password: bcrypt.hashSync(req.body.password, 10),
    });

    try {
        const found = await UserModel.findOne({ username: req.body.username });

        if (!found) {
            await users.save();
            console.log('User saved successfully:', users);
            res.render("login"); // Redirect to login after successful signup
        } else {
            console.log('User already exists:', found);
            res.render("login");
        }
    } catch (error) {
        console.error('Error saving user:', error);
    }
});

app.post('/appointment/:doctor', isAuthenticated,async (req, res) => {
    const doctor = req.params.doctor; // Extract doctor from URL parameter
    const roomId = uuidv4();

    if (!req.session.username) {
        return res.status(401).json({ error: 'User not logged in' });
    }

    const appointments = new AppointmentModel({
        patientUsername: req.session.username,
        doctorUsername: doctor,
        date: req.body.date,
        time: req.body.time,
        roomId: roomId
    });

    try {
        await appointments.save();
        const msg=`Hello ${req.session.name}, your appointment with Dr. ${doctor} is booked for ${req.body.date} at ${req.body.time}.`;

        
        /*const message = await sendWhatsAppMessage(`+91${req.body.phone}`, msg);
        console.log("WhatsApp message sent successfully:", message);*/
        //Above code for twilio


        sendEmail(req.session.username, 'Appointment Booked', msg);
        return res.send(`
            <script>
                alert('Congratulation!! Your appointment is booked. You will receive details on whatsapp.');
                window.location.href = '/dashboard-patient';
            </script>
        `);
        console.log("Appointment saved successfully:", appointments);
        res.status(200).json({ message: 'Appointment created successfully' });
    } catch (err) {
        console.error("Error saving appointment:", err);
        res.status(500).json({ error: 'Error saving appointment' });
    }
});

app.post('/login', (req, res, next) => {
    const userType = req.body.options;
    let authenticateUser;

    if (userType === 'doctor') {
        authenticateUser = passport.authenticate('doctor-local', (err, user, info) => {
            handleAuthentication(err, user, userType, req, res, next);
        });
    } else if (userType === 'patient') {
        authenticateUser = passport.authenticate('patient-local', (err, user, info) => {
            handleAuthentication(err, user, userType, req, res, next);
        });
    } else {
        return res.redirect('/login'); // Invalid userType, redirect to login
    }

    authenticateUser(req, res, next);
});

function handleAuthentication(err, user, userType, req, res, next) {
    if (err) {
        return next(err);
    }
    if (!user) {
        return res.send(`
            <script>
                alert('Wrong password. Please try again.');
                window.location.href = '/login';
            </script>
        `);
    }
    req.logIn(user, (err) => {
        if (err) {
            return next(err);
        }
        req.session.username = user.username;
        req.session.name = user.name;
        console.log('User logged in, session username set:', req.session.username);
        console.log(userType);
        if(userType==='patient'){
            return res.redirect('/dashboard-patient');
        }
        if(userType==='doctor'){
            return res.redirect('/dashboard-doctor');
        }
    });
}

app.post('/home-form',(req,res)=>{
    res.redirect('/doctor');
})

app.listen(1000, (req, res) => {
    console.log("Listening to port 1000");
});
