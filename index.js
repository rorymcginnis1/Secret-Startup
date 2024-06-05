const { Request, Response } = require("express");
const { OpenAIApi, Configuration } = require("openai");
const dotenv = require("dotenv");

dotenv.config();

const configuration = new Configuration({
    apiKey: process.env.API_KEY,
});

const openai = new OpenAIApi(configuration);

const conversationContext = [];
const currentMessages = [];

exports.generateResponse = async (req, res) => {
    try {
        const { prompt } = req.body;
        const modelId = "gpt-3.5-turbo";
        const promptText = `${prompt}\n\nResponse:`;

        for (const [inputText, responseText] of conversationContext) {
            currentMessages.push({ role: "user", content: inputText });
            currentMessages.push({ role: "assistant", content: responseText });
        }
        currentMessages.push({ role: "user", content: promptText });

        const result = await openai.createChatCompletion({
            model: modelId,
            messages: currentMessages,
        });
        const responseText = result.data.choices.shift().message.content;
        conversationContext.push([promptText, responseText]);
        res.send({ response: responseText });
    
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
};
