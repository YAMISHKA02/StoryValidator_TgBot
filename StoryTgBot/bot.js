import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';
import sqlite3 from 'sqlite3';
import { getValidatorInfo } from './dataupdate.js';
import { config } from 'dotenv';

config(); // Загружает переменные окружения из .env файла


const token = process.env.BOT_KEY;
// Инициализация бота
const API_TOKEN = token;
const bot = new Telegraf(API_TOKEN);

// Инициализация базы данных
const db = new sqlite3.Database('validators.db', (err) => {
    if (err) {
        console.error('Ошибка при подключении к базе данных:', err.message);
    } else {
        console.log('Подключение к базе данных установлено.');
    }
});

// Создание таблицы для отслеживания валидаторов и пользователей
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        operator_address TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS validators (
        operator_address TEXT PRIMARY KEY,
        rank INTEGER,
        hex_address TEXT,
        jailed BOOLEAN,
        bond_status TEXT,
        uptime REAL,
        commission REAL,
        moniker TEXT,
        voting_power_percent REAL,
        avatar TEXT,
        tokens INTEGER,
        cumulative_share REAL,
        validator_id INTEGER
    )`);
});




// Функция для получения валидаторов
async function fetchValidators() {
    try {
        const response = await fetch('https://testnet.story.api.explorers.guru/api/v1/validators');
        if (!response.ok) {
            throw new Error(`Ошибка при получении данных: ${response.statusText}`);
        }
        const data = await response.json();
        console.log('Запрос данных валидаторов')
        return data; // Возвращаем данные валидаторов
    } catch (error) {
        console.error("Ошибка в fetchValidators:", error.message);
        return null; // В случае ошибки возвращаем null
    }
}


// Функция для обновления данных валидаторов в базе данных
// Функция для обновления данных валидаторов в базе данных
async function updateValidators() {
    const validators = await fetchValidators(); // Получаем список валидаторов
    if (!validators) {
        console.error("Не удалось получить данные о валидаторах.");
        return;
    }

    // Перебираем валидаторов и обрабатываем каждого
    for (const validator of validators) {
        const {
            operatorAddress,
            rank,
            hexAddress,
            jailed,
            bondStatus,
            uptime,
            commission,
            moniker,
            votingPowerPercent,
            avatar,
            tokens,
            cumulativeShare,
            validatorId
        } = validator;

        // Получаем текущие данные валидатора из базы данных
        db.get("SELECT * FROM validators WHERE operator_address = ?", [operatorAddress], async (err, row) => {
            if (err) {
                console.error("Ошибка при получении данных валидатора:", err.message);
                return;
            }

            // Проверяем, изменились ли данные
            if (row) {
                const hasChanges = 
                    (row.rank < 200 && row.rank != rank) ||                   // Ранг
                    row.jailed != jailed ||               // Статус заключения
                    row.bond_status != bondStatus ||
                    row.tokens != tokens      // Статус залога              // Доступность
                    row.commission != commission;   
                // Если данные изменились, вызываем warnSubbers
                if (hasChanges) {
                    warnSubbers(operatorAddress, validator,row);
                }
            }

            // Подготавливаем новый оператор для вставки/обновления
            const stmt = db.prepare(`INSERT OR REPLACE INTO validators (
                operator_address,
                rank,
                hex_address,
                jailed,
                bond_status,
                uptime,
                commission,
                moniker,
                voting_power_percent,
                avatar,
                tokens,
                cumulative_share,
                validator_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

            // Обновляем или вставляем данные валидатора
            stmt.run(
                operatorAddress,
                rank,
                hexAddress,
                jailed,
                bondStatus,
                uptime,
                commission,
                moniker,
                votingPowerPercent,
                avatar,
                tokens,
                cumulativeShare,
                validatorId
            );

            stmt.finalize(); // Завершаем оператор после использования
        });
    }

    console.log("Данные валидаторов успешно обновлены.");
}

// Запускаем обновление данных валидаторов каждые 5 секунд
setInterval(updateValidators, 60 * 1000);

/// Ваша функция warnSubbers
async function warnSubbers(operatorAddress, validator, val_timeout) {
    // Получаем список пользователей, подписанных на валидатора
    db.all("SELECT user_id FROM users WHERE operator_address = ?", [operatorAddress], (err, rows) => {
        if (err) {
            console.error("Ошибка при получении пользователей:", err.message);
            return;
        }

        if (rows.length === 0) {
            console.log(`Нет подписчиков ${operatorAddress}`);
            return; // Если нет подписчиков, выходим
        }

        // Уведомляем каждого подписчика
        rows.forEach(row => {
            const userId = row.user_id;
            sendAlert(userId, validator, val_timeout)
        });

        console.log(`Уведомление отправлено подписчикам валидатора ${operatorAddress}.`);
    });
}

async function sendAlert(userId, validator, row) {
    // Инициализируем массив для хранения сообщений о изменениях
    const changes = [];

    // Проверяем, какие параметры изменились
    if (row.rank != validator.rank) {
        changes.push(`*Old Rank:* ${row.rank}, *New rank:* ${validator.rank}`);
    }
    if (row.jailed != validator.jailed) {
        changes.push(`*Current Jail Status* ${validator.jailed ? 'JAILED' : 'UNJAILED'}`);
    }
    if (row.bond_status != validator.bondStatus) {
        changes.push(`*Bond Status:* from ${row.bond_status} to ${validator.bondStatus}`);
    }
    if (row.uptime != validator.uptime) {
        changes.push(`*Current Uptime:* ${validator.uptime}%`);
    }
    if (row.commission != validator.commission) {
        changes.push(`*Comission changed* to ${validator.commission}%.`);
    }

    // Если есть изменения, формируем сообщение
    if (changes.length > 0) {
        const message = `Attention! Validator status ${validator.operatorAddress} changed:\n\n- ${changes.join('\n- ')}`;
        await bot.telegram.sendMessage(userId, message);
        console.log(`Уведомление отправлено пользователю ${userId}: ${message}`);
    } else {
        console.log(`Нет изменений для валидатора ${validator.operatorAddress}.`);
    }
}


// Команда для подписки на валидатора
// Команда для подписки на валидатора
bot.command('subscribe', (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) {
        ctx.reply("Use like this: /subscribe <operator_address>");
        return;
    }

    const operatorAddress = args[1];

    // Проверяем, подписан ли пользователь на валидатора
    db.get("SELECT operator_address FROM users WHERE user_id = ?", [ctx.from.id], (err, row) => {
        if (err) {
            console.error("Ошибка при проверке подписки:", err.message);
            ctx.reply("Attemps to check your subscribe Failed");
            return;
        }

        if (row) {
            // Если пользователь уже подписан, выводим адрес валидатора и спрашиваем о перезаписи
            const existingAddress = row.operator_address;
            ctx.reply(`You are already subscribed to the validator ${existingAddress}. Do you want to overwrite it with ${operatorAddress}? (yes/no)`);
            
            // Ожидаем ответа пользователя
            bot.on('text', (responseCtx) => {
                const answer = responseCtx.message.text.toLowerCase();
                if (answer === 'yes') {
                    // Перезаписываем подписку
                    db.run("UPDATE users SET operator_address = ? WHERE user_id = ?", [operatorAddress, ctx.from.id], (updateErr) => {
                        if (updateErr) {
                            console.error("Ошибка при обновлении подписки:", updateErr.message);
                            responseCtx.reply("An error occurred while updating the subscription ⚠️");
                        } else {
                            responseCtx.reply(`Subscription successfully updated to validator ${operatorAddress}. ✅`);
                        }
                    });
                } else if (answer === 'no') {
                    responseCtx.reply("Subscription not changed 🚫");
                } else {
                    responseCtx.reply("Please respond with 'yes' or 'no'🙏");
                }
            });
        } else {
            // Если пользователь не подписан, добавляем новую подписку
            db.run("INSERT OR IGNORE INTO users (user_id, operator_address) VALUES (?, ?)", [ctx.from.id, operatorAddress], (insertErr) => {
                if (insertErr) {
                    console.error("Ошибка при добавлении пользователя:", insertErr.message);
                    ctx.reply("An error occurred while subscribing 😞");
                } else {
                    ctx.reply(`You have subscribed to track the validator ${operatorAddress} 🎉`);
                }
            });
        }
    });
});

// Команда для получения адреса валидатора, на которого подписан пользователь
bot.command('subscribed', (ctx) => {
    db.get("SELECT operator_address FROM users WHERE user_id = ?", [ctx.from.id], (err, row) => {
        if (err) {
            console.error("Ошибка при получении адреса валидатора:", err.message);
            ctx.reply("An error occurred while retrieving the validator address ❌");
            return;
        }

        if (row) {
            ctx.reply(`You are subscribed to the validator: ${row.operator_address} ✅`);
        } else {
            ctx.reply("You are not subscribed to any validator 🚫");
        }
    });
});

// Команда для проверки данных валидатора по адресу
bot.command('check', (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) {
        ctx.reply("Usage: /check <operator_address> 📜");
        return;
    }

    const operatorAddress = args[1];
    getValidatorInfo(operatorAddress, ctx); // Вызов вспомогательной функции
});

// Команда для проверки данных валидатора, на которого подписан пользователь
bot.command('checksubbed', (ctx) => {
    db.get("SELECT operator_address FROM users WHERE user_id = ?", [ctx.from.id], async (err, row) => {
        if (err) {
            console.error("Ошибка при получении адреса валидатора:", err.message);
            ctx.reply("An error occurred while fetching the validator data. ⚠️");
            return;
        }

        if (row) {
            const operatorAddress = row.operator_address;
            getValidatorInfo(operatorAddress, ctx); // Вызов вспомогательной функции
        } else {
            ctx.reply("You are not subscribed to any validator ❌");
        }
    });
});

// Команда /start
bot.command('start', (ctx) => {
    const startMessage = "Hello! I'm a bot for tracking Story Protocol validators. Please choose an action: 🤖✨";
    ctx.reply(startMessage, Markup.inlineKeyboard([
        [Markup.button.callback('Подписаться на валидатора', 'subscribe')],
        [Markup.button.callback('Проверить валидатора', 'check')]
    ]));
});

// Обработка действий кнопок
bot.action('subscribe', (ctx) => {
    ctx.reply("Please enter the validator address in the format /subscribe <operator_address> 📩🔗");
});

bot.action('check', (ctx) => {
    ctx.reply("Please enter the validator address in the format /check <operator_address> 📩🔍");
});


// Установка доступных команд для бота
const commands = [
    { command: 'start', description: 'Start the bot' },
    { command: 'subscribe', description: 'Subscribe to a validator' },
    { command: 'check', description: 'Check a validator by address' },
    { command: 'checksubbed', description: 'Check the subscribed validator' },
    { command: 'subscribed', description: 'Show the address of the validator you are subscribed to' },
];


// Установка команд
bot.telegram.setMyCommands(commands).then(() => {
    console.log("Доступные команды установлены.");
}).catch(err => {
    console.error("Ошибка при установке команд:", err);
});

bot.launch()

// Обработка завершения работы
process.on('SIGINT', () => {
    console.log("Получен сигнал остановки. Завершение работы...");
    db.close();
    bot.stop();
});
