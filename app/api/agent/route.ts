import { NextResponse } from "next/server";
import { createAgent } from "./create-agent";

interface AgentRequest {
  userMessage: string;
  walletAddress?: string | null;
}

interface AgentResponse {
  reply?: string;
  error?: string;
}

export async function POST(req: Request): Promise<NextResponse<AgentResponse>> {
  try {
    // 1. Extract and validate user message
    const body: AgentRequest = await req.json();
    const { userMessage, walletAddress } = body;

    if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim()) {
      return NextResponse.json({ 
        error: "Invalid message: userMessage is required and must be a non-empty string" 
      }, { status: 400 });
    }

    // 2. Create agent (without CDP)
    let agent;
    try {
      agent = await createAgent();
    } catch (agentError) {
      console.error("Error creating agent:", agentError);
      return NextResponse.json({
        error: "Failed to initialize agent. Please check your configuration."
      }, { status: 500 });
    }

    // 3. Build context with wallet info if available
    const contextMessage = walletAddress 
      ? `User wallet: ${walletAddress}\nUser message: ${userMessage.trim()}`
      : userMessage.trim();

    // 4. Stream agent response with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Agent response timeout')), 30000);
    });

    const streamPromise = agent.stream(
      { messages: [{ content: contextMessage, role: "user" }] },
      { configurable: { thread_id: walletAddress || "default-thread" } },
    );

    const stream = await Promise.race([streamPromise, timeoutPromise]);

    // 5. Process streamed response
    let agentResponse = "";
    for await (const chunk of stream) {
      if ("agent" in chunk) {
        const content = chunk.agent.messages[0]?.content;
        if (content && typeof content === 'string') {
          agentResponse += content;
        }
      }
    }

    // 6. Validate response
    if (!agentResponse.trim()) {
      return NextResponse.json({
        reply: "I apologize, but I couldn't generate a response. Please try rephrasing your question."
      });
    }

    // 7. Return response
    return NextResponse.json({ reply: agentResponse });
    
  } catch (error) {
    console.error("Error processing request:", error);
    
    let errorMessage = "I'm sorry, I encountered an issue processing your message.";
    
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        errorMessage = "Request timed out. Please try again.";
      } else if (error.message.includes('Invalid value for') || error.message.includes('null')) {
        errorMessage = "Invalid message format. Please try again.";
      } else {
        errorMessage = error.message;
      }
    }
    
    return NextResponse.json({
      error: errorMessage
    }, { status: 500 });
  }
}