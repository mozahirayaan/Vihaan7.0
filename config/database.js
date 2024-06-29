const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_ATLAS);

const userSchema = mongoose.Schema({
    username: String,
    name: String,
    password: String,
})

const doctorSchema = mongoose.Schema({
    username: String,
    department: String,
    password: String,
    name: String,
})

const appointmentSchema = mongoose.Schema({
    patientUsername: String,
    doctorUsername: String,
    date: String,
    time: String,
    roomId: String
})



const UserModel = mongoose.model('users', userSchema);
const DoctorModel = mongoose.model('doctors', doctorSchema);
const AppointmentModel = mongoose.model('appointments', appointmentSchema);


module.exports = {
   UserModel, DoctorModel ,AppointmentModel 
};
