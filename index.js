const express = require('express')
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const app = express();
const {
  v4: uuidv4
} = require('uuid');

app.use(fileUpload());
app.use(bodyParser.json());
const JWT_SECRET = "1c536fd2c1988309ea6bb21c48317d685ae334ed1a7294ad9e0441b216d20b6e"
const mysql = require('mysql2');
//const mysql = require('pg');
app.use(cors());

const dbConfig = {
    host: 'db4free.net',
    user: 'chandrahas',
    password: 'toddle@123',
    database: 'toddlebackenddb',
};

// const dbConfig = {
//   host: 'localhost',
//   user: 'root',
//   password: 'hasu@811921',
//   database: 'toddlebackenddb',
// };

// db.connect((err) => {
//     if (err) {
//         console.error('Error connecting to MySQL:', err);
//     } else {
//         console.log('Connected to MySQL');
//     }
// });

async function getUserByUsername(username) {
  return new Promise((resolve, reject) => {
    const db = mysql.createConnection(dbConfig);
    db.query('SELECT * FROM user_login WHERE username = ?', [username], (err, results) => {
      if (err) {
        reject(err);
      }
      const user = results[0];
      resolve(user);
    });
    db.end()
  });
}

async function getJournalByUniqueKey(unique_key) {
  return new Promise((resolve, reject) => {
    const db = mysql.createConnection(dbConfig);
    db.query('SELECT * FROM journal_data WHERE unique_key = ?', [unique_key], (err, results) => {
      if (err) {
        reject(err);
      }
      const user = results[0];
      resolve(user);
    });
    db.end()
  });
}

function verifyToken(req, res, next) {
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(401).json({
      message: 'Missing token'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({
        message: 'Invalid token'
      });
    }
    req.username = decoded.username;
    next();
  });
}

app.post('/register', async (req, res) => {
  const {
    username,
    password,
    role
  } = req.body;

  // Check if the username already exists
  const existingUser = await getUserByUsername(username);
  if (existingUser) {
    return res.status(409).json({
      message: 'Username already exists'
    });
  }

  // Hash the password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Insert the new user
  const insertQuery = 'INSERT INTO user_login (username, password, role) VALUES (?, ?, ?)';
  const db = mysql.createConnection(dbConfig);
  db.query(insertQuery, [username, hashedPassword, role], (err) => {
    if (err) {
      return res.status(500).json({
        message: 'Failed to register user'
      });
    }
    db.end()

    res.json({
      message: 'User registered successfully'
    });
  });
});


app.post('/login', async (req, res) => {
  const {
    username,
    password
  } = req.body;

  // Check if user exists and password matches
  const user = await getUserByUsername(username);
  if (!user) {
    return res.status(401).json({
      message: 'User does not exist'
    });
  }

  // Compare hashed password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({
      message: 'Authentication failed'
    });
  }

  // Generate and send JWT token
  const token = jwt.sign({
    username
  }, JWT_SECRET);
  res.json({
    token
  });
});

app.post('/create-journal', verifyToken, async (req, res) => {
  const {
    teacherUsername,
    description,
    taggedStudents,
    publish_at
  } = req.body;
  const user = await getUserByUsername(teacherUsername)
  if (!user) {
    return res.status(401).json({
      message: 'User does not exist'
    });
  } else if (user.role == 'student') {
    return res.status(401).json({
      message: 'User is not a teacher'
    });
  } else {
    const publishDate = new Date(publish_at)
    // publishDate.setUTCHours(publishDate.getUTCHours());
    // publishDate.setUTCMinutes(publishDate.getUTCMinutes());
    let attachmentFilename = null; // Default to null if no attachment
    let attachmentType = null;
    const uuid = uuidv4();
    console.log(uuid);

    if (req.files && req.files.attachment) {
      // If there is a file attached
      const attachmentFile = req.files.attachment;

      temp = attachmentFile.name.split('.')
      attachmentType = temp[temp.length - 1]

      // Create a directory for the teacher if it doesn't exist
      const teacherDirectory = path.join(__dirname, 'teacher_attachments', teacherUsername);
      if (!fs.existsSync(teacherDirectory)) {
        fs.mkdirSync(teacherDirectory, { recursive: true });
      }

      // Generate a timestamp for the attachment filename
      const timestamp = new Date().getTime();
      attachmentFilename = `${timestamp}_${attachmentFile.name}`;

      // Move the attachment file to the teacher's directory
      const attachmentPath = path.join(teacherDirectory, attachmentFilename);
      attachmentFile.mv(attachmentPath, async (err) => {
        if (err) {
          return res.status(500).json({
            message: 'Failed to upload attachment'
          });
        }

        // Insert journal data into the database with attachment filename
        console.log('teacherUsername - ', teacherUsername);
        console.log('description - ', description);
        console.log('taggedStudents - ', taggedStudents);
        console.log('attachmentType - ', attachmentType);
        console.log('attachmentFilename - ', attachmentFilename);
        console.log('publishDate - ', publishDate);
        console.log("unique_key - ",uuid )
        await insertJournalData(teacherUsername, description, taggedStudents, attachmentType, attachmentFilename, publishDate, uuid,res);
      });
    } else {
      // Insert journal data into the database without attachment filename
      console.log('teacherUsername - ', teacherUsername);
      console.log('description - ', description);
      console.log('taggedStudents - ', taggedStudents);
      console.log('attachmentType - ', attachmentType);
      console.log('attachmentFilename - ', attachmentFilename);
      console.log('publishDate - ', publishDate);
      console.log("unique_key - ",uuid )
      await insertJournalData(teacherUsername, description, taggedStudents, attachmentType, attachmentFilename, publishDate, uuid,res);
    }
  }
});

async function insertJournalData(teacherUsername, description, taggedStudents, attachmentType, attachmentFilename, publishDate,uuid, res) {
  const insertQuery = 'INSERT INTO journal_data (teacher_username, description, tagged_students, attachment_type, attachment_filename, publish_date, unique_key) VALUES (?, ?, ?, ?, ?, ?, ?)';
  const db = mysql.createConnection(dbConfig);
  db.query(insertQuery, [teacherUsername, description, taggedStudents, attachmentType, attachmentFilename, publishDate, uuid], (err) => {
    if (err) {
      db.end();
      return res.status(500).json({
        message: 'Failed to create journal'
      });
    }
    db.end();
    res.json({
      message: 'Journal created successfully'
    });
  });
}


// Get journals for teacher
app.get('/get-journals-teacher', verifyToken, async (req, res) => {
  const {
    username
  } = req.body;
  const user = await getUserByUsername(username);

  if (!user) {
    return res.status(401).json({
      message: 'User does not exist'
    });
  } else if (user.role !== 'teacher') {
    return res.status(401).json({
      message: 'User is not a teacher'
    });
  } else {
    const selectQuery = 'SELECT * FROM journal_data WHERE teacher_username = ?';
    const db = mysql.createConnection(dbConfig);
    db.query(selectQuery, [username, "teacher"], (err, results) => {
      db.end();
      if (err) {
        return res.status(500).json({
          message: 'Failed to fetch journals'
        });
      }
      res.json(results);
    });
  }
});

// Get journals for student
app.get('/get-journals-student', verifyToken, async (req, res) => {
  const {
    username
  } = req.body;
  const user = await getUserByUsername(username);

  if (!user) {
    return res.status(401).json({
      message: 'User does not exist'
    });
  } else if (user.role !== 'student') {
    return res.status(401).json({
      message: 'User is not a student'
    });
  } else {
    const currentDate = new Date();
    currentDate.setUTCHours(currentDate.getUTCHours() + 5);
    currentDate.setUTCMinutes(currentDate.getUTCMinutes() + 30);
    const selectQuery = 'SELECT * FROM journal_data WHERE FIND_IN_SET(?, tagged_students) AND publish_date <= ?';
    const db = mysql.createConnection(dbConfig);
    db.query(selectQuery, [username, currentDate], (err, results) => {
      db.end();
      if (err) {
        return res.status(500).json({
          message: 'Failed to fetch journals'
        });
      }
      res.json(results);
    });
  }
});

app.put('/update-journal/', verifyToken, async (req, res) => {
  const { username, unique_key, description, taggedStudents } = req.body;

  // Check if the journal exists
  const existingJournal = await getJournalByUniqueKey(unique_key);
  let attachmentType = null;
  if (!existingJournal) {
    return res.status(404).json({ message: 'Journal not found' });
  }

  // Ensure that the logged-in user is the teacher who created the journal
  if (existingJournal.teacher_username !== username) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  // Update journal data
  const updateQuery = 'UPDATE journal_data SET description = ?, tagged_students = ?, attachment_type = ?, attachment_filename = ? WHERE unique_key = ?';
  const db = mysql.createConnection(dbConfig);
  
  if (req.files && req.files.attachment) {
    // If there is a new attachment file
    const attachmentFile = req.files.attachment;
    const teacherDirectory = path.join(__dirname, 'teacher_attachments', username);
    if (!fs.existsSync(teacherDirectory)) {
      fs.mkdirSync(teacherDirectory, { recursive: true });
    }

    temp = attachmentFile.name.split('.')
    attachmentType = temp[temp.length - 1]

    const timestamp = new Date().getTime();
    const attachmentFilename = `${timestamp}_${attachmentFile.name}`;

    const attachmentPath = path.join(teacherDirectory, attachmentFilename);
    attachmentFile.mv(attachmentPath, async (err) => {
      if (err) {
        db.end();
        return res.status(500).json({ message: 'Failed to upload attachment' });
      }

      // Update journal data in the database with new attachment filename
      db.query(updateQuery, [description, taggedStudents, attachmentType, attachmentFilename, unique_key], (err) => {
        db.end();
        if (err) {
          return res.status(500).json({ message: 'Failed to update journal' });
        }
        res.json({ message: 'Journal updated successfully' });
      });
    });
  } else {
    // Update journal data in the database without changing the attachment filename
    db.query(updateQuery, [description, taggedStudents, existingJournal.attachmentType, existingJournal.attachment_filename, unique_key], (err) => {
      db.end();
      if (err) {
        return res.status(500).json({ message: 'Failed to update journal' });
      }
      res.json({ message: 'Journal updated successfully' });
    });
  }
});

app.delete('/delete-journal/', verifyToken, async (req, res) => {
  const { username, unique_key } = req.body;

  // Check if the journal exists
  const existingJournal = await getJournalByUniqueKey(unique_key);
  if (!existingJournal) {
    return res.status(404).json({ message: 'Journal not found' });
  }

  // Ensure that the logged-in user is the teacher who created the journal
  if (existingJournal.teacher_username !== username) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  // Delete journal data
  const deleteQuery = 'DELETE FROM journal_data WHERE unique_key = ?';
  const db = mysql.createConnection(dbConfig);
  db.query(deleteQuery, [unique_key], (err) => {
    db.end();
    if (err) {
      return res.status(500).json({ message: 'Failed to delete journal' });
    }
    res.json({ message: 'Journal deleted successfully' });
  });
});

app.listen(4000, () => {
  console.log(`Server is running on port ${4000}`);
});