const bcrypt = require("bcrypt");
bcrypt.hash("kudoraAdmin!", 10).then(console.log);