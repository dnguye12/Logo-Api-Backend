/* eslint-disable no-undef */
require('dotenv').config()

const PORT = process.env.PORT
const MONGODB_URI = process.env.MONGODB_URI
const LOGO_API = process.env.LOGO_API

module.exports = {
	MONGODB_URI,
	PORT,
	LOGO_API
}