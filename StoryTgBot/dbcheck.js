const sqlite3 = require('sqlite3').verbose();

// Инициализация базы данных
const db = new sqlite3.Database('validators.db', (err) => {
    if (err) {
        console.error('Ошибка при подключении к базе данных:', err.message);
        return;
    }
    console.log('Подключение к базе данных установлено.');
});

// Функция для вывода одной записи валидатора из базы данных
function displaySingleValidator() {
    db.get("SELECT * FROM validators LIMIT 1", [], (err, row) => {
        if (err) {
            console.error("Ошибка при получении данных из базы данных:", err.message);
            return;
        }

        // Проверка, есть ли данные
        if (!row) {
            console.log("В базе данных нет валидаторов.");
            return;
        }

        // Вывод данных
        console.log(row)
    });
}

// Вызов функции для отображения одной записи валидатора
displaySingleValidator();

// Закрытие базы данных после завершения
db.close((err) => {
    if (err) {
        console.error('Ошибка при закрытии базы данных:', err.message);
    } else {
        console.log('База данных закрыта.');
    }
});
