const fs = require('fs');
const path = require('path');
const axios = require('axios');

const user = "PASIYA-MDv";
const repo = "DATABASE";
const branch = 'main';

const savePath = path.join(__dirname, 'index.js'); 


async function start() {
  try {

    if(savePath){
    const yasiyaMd = require('./index');
    await yasiyaMd(user, repo);
    }

  } catch (error) {
    console.error('❌ Error in start YASIYA-MD():', error.message);
  }
}

start();
