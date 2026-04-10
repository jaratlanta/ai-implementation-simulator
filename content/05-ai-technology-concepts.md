# AI Technology Concepts

## The History of AI

AI is not new. The term was coined at a Dartmouth conference in the late 1940s/early 1950s, spurred in part by massive technology investment related to World War II and science fiction novels exploring the concept of machine intelligence.

In the late 1950s, the first machine learning model was created — a checkers-playing system. The initial approach was rule-based: teach the machine the rules of checkers and when to make decisions. But rule-based systems are predictable and easy to beat. The breakthrough came with introducing probability into the equation through min-max theory, which is still utilized in modern AI. When the machine started making probabilistic rather than purely deterministic decisions, it began winning. This became the foundation of machine learning.

## Traditional Machine Learning

Traditional machine learning is fundamentally a prediction engine. It can be deterministic (rule-based) or probabilistic, and most modern applications combine both approaches. Familiar examples include mapping applications (rule-based pathfinding) and recommendation engines (probabilistic content prediction based on user history and behavior data).

Key characteristics of traditional ML: it requires structured data, a critical mass of data points for accuracy, and the predictions are explainable — you can trace why the model made a specific recommendation. This explainability is critical in regulated industries where decisions must be justified (loan approvals, for example).

Traditional ML models are trained on pre-existing data — viewing history, transaction patterns, user behavior. They use confusion matrices and other metrics to evaluate prediction accuracy. The more data and the less biased that data is, the better the outcomes.

## Large Language Models (LLMs)

LLMs represent the major revolution in modern AI. Also called foundational models, frontier models, or transformer models, they are the engines behind consumer-facing products like general-purpose chatbots and AI assistants.

The breakthrough technology behind LLMs is the self-attention mechanism, described in a 2017 research paper titled "Attention Is All You Need." Previous models predicted the next word by looking at one word at a time in sequence. Self-attention allows the model to look at entire sentences, paragraphs, and ultimately entire books simultaneously to predict outcomes.

This capability is powered by graphical processing units (GPUs) that enable multi-threading — processing many different things at one time. This is why GPU manufacturers have become among the most valuable companies in the world.

LLMs are pre-trained models, meaning they have already been trained on vast amounts of data before anyone uses them. Training data includes books, everything on the web, wikis, software code, conversations, media, and more. Early models were trained on approximately 200 billion parameters; newer models are trained on over a trillion parameters. Parameters are not just data points — they include context and relationships between data, which is what allows LLMs to understand not just information but how information connects to other information.

## Multimodal Capability

One of the most powerful features of modern LLMs is multimodal processing — the ability to consume and process multiple types of information including text, images, video, audio, and other unstructured data. Traditional ML models required structured data (rows and columns). LLMs can make sense of conversations, videos, documents, and other unstructured information, dramatically expanding the types of problems AI can address.

## The Application Layer vs. the Engine

An important distinction that most people miss: when interacting with consumer AI products, users are experiencing an application layer, not the full power of the underlying LLM. These applications are optimized for conversational interaction — quick responses, limited token usage, and cost efficiency for the provider.

The full power of an LLM is accessible programmatically through APIs (Application Programming Interfaces). A normal consumer interaction might use 50,000 tokens; programmatic access can leverage millions of tokens. Tasks that might be impossible in a chat interface — processing enormous datasets, running complex multi-step analyses, generating comprehensive reports — become feasible when accessing the LLM directly.

This distinction is critical for organizational planning: don't let the limitations of consumer chat interfaces constrain imagination about what AI can accomplish. The capabilities are far larger than what any chat interface reveals.

## Hallucination

Hallucination occurs when AI confidently generates information that is incorrect or made up. Every user of AI has encountered this to some degree. LLMs are trained to have a preference for sounding right rather than actually being right, because the probabilistic nature of the technology is what allows it to create novel outputs.

Hallucination is actually a feature, not a bug — it's the same probabilistic mechanism that enables AI to create things that have never existed before. But it means that human oversight is essential. Models are improving through techniques like recursive self-evaluation (thinking models that plan actions and evaluate their own outputs), but they still get things wrong.

Practical mitigations include asking models to cite sources, using thinking/reasoning modes, implementing deterministic rules around outputs, and always maintaining a human in the loop for important decisions. Never copy-paste AI output without review and revision.

## RAG (Retrieval Augmented Generation)

RAG is a technique for giving AI access to an organization's proprietary data without retraining the entire model. LLMs are pre-trained on public data but know nothing about a specific organization's internal information.

RAG works like a librarian: it checks out relevant internal information and provides it to the LLM to produce better, more contextual responses. This information can be spreadsheets, documents, videos, emails, or any other data source. In enterprise ecosystems, RAG can connect to email, document management systems, and other internal tools.

Common applications include internal knowledge bases where employees can ask questions about policies, standard operating procedures, program knowledge, or other institutional information through a chat interface. The technology retrieves relevant internal documents and provides them as context for the AI's response.

## MCP (Model Context Protocol)

MCP is a relatively new standard (approximately 18 months old) that allows AI to connect to external tools and data sources in real time. While RAG provides context by checking data in and out, MCP enables persistent connections to disparate systems — CRMs, HR platforms, payroll systems, external databases, and more.

The transformative aspect: MCP allows AI to not only read from multiple data sources simultaneously but also write to them. An AI system can pull data from one source, analyze it, predict an outcome, and then update another system with the results. This enables end-to-end automation workflows that span multiple systems.

Practical examples include AI that can plan travel by simultaneously accessing flight, hotel, and scheduling systems; impact reporting systems that pull live data from multiple tracking platforms; and grant scanning agents that monitor federal databases, corporate giving programs, and funding announcements to identify opportunities.

## Agents

An agent is an AI system that can think, understand data, use tools, and complete multi-step tasks — in many cases autonomously. The key distinction from a chatbot: agents can take actions, not just answer questions.

Different types of agents exist on a spectrum of autonomy. Some operate through triggers, requiring a prompt to take action. Others can operate continuously, scanning for conditions and acting on them. The most autonomous agents (like computer-use agents) can operate completely independently, using every data source and login available to them — though this level of autonomy is not recommended for organizational use without significant guardrails.

Practical agent applications include document generation agents that produce consistently branded materials every time, project management agents that track tasks and generate weekly status reports, market scanning agents that simultaneously monitor multiple data sources for opportunities, and multi-agent systems where specialized agents collaborate to accomplish complex workflows.

The year of agents represents the future of how AI will operate in business. As people become comfortable with what agents are and what they do, the next frontier is multi-agent orchestration — coordinating multiple specialized agents to work together on complex objectives.

## AGI (Artificial General Intelligence)

AGI represents the next major milestone in AI development. Unlike current models that must be specifically trained on datasets, AGI will learn the way humans learn — by observing, listening, and experiencing. A pre-trained model needs hundreds of millions of dollars worth of French language data to understand French; AGI will learn French by listening to conversations, the same way a child does.

Nobody knows exactly when AGI will arrive. Estimates that were once 30 years out are now commonly cited at 2-5 years. The CEO of one major AI company has predicted late 2027. Regardless of the exact timeline, AGI is coming and will dramatically impact every organization.

The practical implication: organizations need to start building AI capability now to be prepared. The teams, processes, data infrastructure, and organizational muscle memory developed today will be the foundation for leveraging AGI when it arrives.

## Superintelligence

Beyond AGI lies superintelligence — the point at which AI surpasses the maximum capability of any individual human mind. This is being driven by the sheer volume of data and parameters these models are trained on, combined with exponentially increasing computing power. What AI cannot do today, it may be capable of in a week or even days.

The implications for research are particularly profound: AI will be able to identify relationships in data that humans have never been able to discover, and conceptualize solutions that have never been thought of before. This capability is already emerging and will accelerate dramatically.
