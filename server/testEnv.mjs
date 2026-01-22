import dotenv from 'dotenv';
dotenv.config();

console.log('DATABASE_URL:', process.env.DATABASE_URL || 'NOT FOUND');
console.log('NODE_ENV:', process.env.NODE_ENV || 'NOT FOUND');
console.log('PORT:', process.env.PORT || 'NOT FOUND');
