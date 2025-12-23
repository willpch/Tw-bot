require('dotenv').config();
const axios = require('axios');

const CLIENT_ID = process.env.CLIENT_ID || 'gp762nuuoqcoxypju8c569th9wz7q5';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || '799awv7b81jr5tgp2d37p9lk5e2jgj';

async function getUserID(username) {
  const res = await axios.get(`https://api.twitch.tv/helix/users?login=${username}`, {
    headers: {
      'Client-ID': CLIENT_ID,
      'Authorization': `Bearer ${ACCESS_TOKEN}`
    }
  });
  console.log('Seu ID numérico é:', res.data.data[0].id);
}

getUserID('lpna_');
