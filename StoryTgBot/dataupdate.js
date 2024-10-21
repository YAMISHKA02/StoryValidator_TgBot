// Вспомогательная функция для получения информации о валидаторе
import axios from 'axios';
async function getValidatorInfo(operatorAddress, ctx) {
    try {
        // Запрос данных о валидаторе
        const data = await fetchValidatorData(operatorAddress);
        if (!data) {
            ctx.reply("🚨 Ошибка при получении данных о валидаторе.");
            return;
        }

        const { rank, jailed, tokens, bondStatus, uptime, commission, votingPowerPercent } = data;

        // Запрос данных о доступности валидатора
        const uptimeData = await fetchUptimeData(operatorAddress);

        // Проверяем, что uptimeData это массив
        if (!Array.isArray(uptimeData)) {
            ctx.reply("🚨 Ошибка: данные доступности недоступны или некорректны.");
            return;
        }

        // Подсчёт удачных блоков
        const successfulBlocks = uptimeData.filter(item => item.signed).length;

        // Визуализация блоков
        const blockVisualization = uptimeData.map(item => (item.signed ? '🟩' : '🟥')).join('');

        // Формирование сообщения с улучшенным форматированием
        // Формирование сообщения с улучшенным форматированием
        const message = `✨ *Validator Info* ✨\n\n` +
                        `*${operatorAddress}*\n\n` +  // Адрес валидатора на новой строке
                        `🔹 *Rank:* ${rank}\n` +
                        `🔹 *Jailed:* ${jailed ? '❌ JAILED' : '✅ Free'}\n` +
                        `🔹 *Tokens:* ${tokens.toLocaleString()}\n` +
                        `🔹 *Bound Status:* ${bondStatus}\n` +
                        `🔹 *Uptime:* ${uptime}%\n` +
                        `🔹 *Comission:* ${commission}%\n` +
                        `🔹 *Voting Power:* ${votingPowerPercent}%\n` +
                        `🔹 *Successful blocks :* *${successfulBlocks}/100*\n\n` + 
                        `Latest 100 blocks:\n\n` + 
                        `${blockVisualization}`;  // Эмодзи визуализация блоков

        // Отправка сообщения
        ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error) {
        console.error("Ошибка при выполнении запросов:", error.message);
        ctx.reply("🚨 Произошла ошибка при получении данных.");
    }
}

// Функция для запроса количества удачных блоков
async function fetchUptimeData(operatorAddress) {
    try {
        const response = await axios.get(`https://testnet.story.api.explorers.guru/api/v1/validators/${operatorAddress}/uptime?limit=100`);
        return response.data;
    } catch (error) {
        console.error("Ошибка при получении данных о времени работы валидатора:", error.message);
        return null;
    }
}

// Функция для запроса данных о валидаторе по API
async function fetchValidatorData(operatorAddress) {
    try {
        const response = await axios.get(`https://testnet.story.api.explorers.guru/api/v1/validators`);
        // Исправлено: добавлен return в фильтре
        const validatorData = response.data.filter(item => item.operatorAddress === operatorAddress);
        
        console.log("Данные о валидаторе:", validatorData); // Логирование данных
        return validatorData.length > 0 ? validatorData[0] : null; // Возвращаем первый найденный валидатор или null
    } catch (error) {
        console.error("Ошибка при получении данных о валидаторе:", error.message);
        return null;
    }
}



export  {
    getValidatorInfo
};