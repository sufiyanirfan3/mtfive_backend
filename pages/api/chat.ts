import { Message } from "@/types";
import type { NextApiRequest, NextApiResponse } from "next";
import { Configuration, OpenAIApi } from "openai";
import pineconeStore from "@/utils/pineconeStore";

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

export default async function translate(req: NextApiRequest, res: NextApiResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*'); // Allow any domain, consider specifying trusted domains
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS'); // Specify allowed methods
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); // Specify allowed headers

  // Handle preflight requests for CORS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const { messages, userName } = req.body;
  const translatedText = await askOpenAI({ messages, userName });

  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify({ translatedText }));
}

async function askOpenAI({
  messages,
  userName,
}: {
  messages: Message[];
  userName: string;
}) {
  const pinecone = await pineconeStore();

  // console.log("messages req: ", messages);

  // updated the message content to include context snippets
  var updatedMsgContent;
  if (messages?.length > 0) {
    const lastMsgContent = messages[messages.length - 1].content;

    let data = await pinecone.similaritySearch(lastMsgContent, 3);

    // console.log("pinecone data.length: ", data.length);

    // Clean the newline characters from data responses

    // data.forEach((item) => {
    //   if (item.pageContent) {
    //     item.pageContent = item.pageContent.replace(/[\\.\n]/g, '');
    //   }
    // });

    // console.log(data);

    updatedMsgContent = `
    user question/statement: ${lastMsgContent}
    context snippets:
    ---
    1) ${data?.[0]?.pageContent}
    ---
    2) ${data?.[1]?.pageContent}
    ---
    3) ${data?.[2]?.pageContent}
    `;

    // console.log(updatedMsgContent);

    messages[messages.length - 1].content = updatedMsgContent;
  }

  try {
    // Act as a conversational AI chatbot. Answer in very detail proper structured way. Donot mention word 'according to document or context or as an AI chatbot or according to information you gave me'. Donot use word 'context'. Don't mention context snippets when replying to user and only mention yourself by your first name. Answer only according to current context. Dont take into account previous messages they are just for reference.

    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo-1106",
      messages: [
        {
          role: "system",
          content:"Provide tailored product recommendations based on user queries. Extract and present detailed product information including Category, Sub Category, Store, Description, Gender, Star Rating, and URL without altering the original text. Respond to greetings like 'hi' or 'hello' with a friendly acknowledgment. Ensure responses are direct and utilize exact product names and details as indexed. Avoid phrases that suggest uncertainty or the inability to find relevant information. Focus on delivering concise and relevant product matches to meet user needs and preferences. Donot include ** inside the text."
          // content:`Recommend products along with their complete information from the trained document. Donot paraphrase anything just give exact name and exact information. Donot mention words like 'in the document' or 'according to information provided' or 'I apologize, I did not find specific information'. If user says "hi" or "hello" then greet him.`
        },
        ...(messages || [
          {
            role: "user",
            content: "Hi There!",
          },
        ]),
      ],
    });

    console.log(response);

    return response?.data?.choices?.[0]?.message?.content;
  } catch (e: any) {
    console.log("error in response: ", e);
    return e;
    // return "There was an error in processing the ai response.";
  }
}
