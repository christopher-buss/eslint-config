export async function read(url: string): Promise<string> {
	const response = await fetch(url);
	const decoder = new TextDecoder();
	let text = "";
	if (response.body === null) {
		return text;
	}

	for await (const chunk of response.body) {
		text += decoder.decode(chunk);
	}

	return text;
}
