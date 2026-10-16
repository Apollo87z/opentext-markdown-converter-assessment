import 'dotenv/config';

export const config ={
    env: process.env.NODE_ENV,
    port: Number(process.env.PORT)
};