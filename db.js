const mysql = require('mysql')
const pool = mysql.createPool({
    host     : '127.0.0.1',
    user     : 'root',
    password : '123456',
    database : 'test',
    port     : '3306',
    // charset : 'utf8mb4'
});

let query = function( sql, values ) {
  return new Promise(( resolve, reject ) => {
    pool.getConnection(function(err, connection) {
      if (err) {
        resolve( 'err' )
      } else {
        connection.query(sql, values, ( err, rows) => {
          if ( err ) {
            console.log('error');
            resolve( 'err' )
          } else {
            //console.log(rows);
            resolve( rows )
          }
          connection.release()
        })
      }
    })
  })
}

module.exports = { query }