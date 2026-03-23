import { useState, useEffect } from "react";

const TabButton = ({ active, label, onClick }: { active: boolean, label: string, onClick: () => void }) => (
    <button
        className={`btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'}`}
        onClick={onClick}
    >
        {label}
    </button>
);

const Beautifier = () => {
    const [input, setInput] = useState("");
    const [output, setOutput] = useState("");
    const [mode, setBeautifyMode] = useState<"json" | "xml" | "sql">("json");
    const [error, setError] = useState<string | null>(null);

    const beautify = () => {
        setError(null);
        try {
            if (mode === "json") {
                const parsed = JSON.parse(input);
                setOutput(JSON.stringify(parsed, null, 4));
            } else if (mode === "xml") {
                // Simple XML beautify (not perfect but works for many cases)
                let formatted = "";
                let indent = "";
                const tab = "    ";
                const nodes = input.replace(/>\s*</g, "><").split(/>/g);

                nodes.forEach((node) => {
                    if (node.match(/^\/\w/)) indent = indent.substring(tab.length);
                    formatted += indent + node + ">\n";
                    if (node.match(/^<?\w[^>]*[^\/]$/) && !node.startsWith("<?")) indent += tab;
                });
                setOutput(formatted.trim().replace(/>$/, ""));
            } else if (mode === "sql") {
                // Very basic SQL formatting
                const keywords = ["SELECT", "FROM", "WHERE", "AND", "OR", "GROUP BY", "ORDER BY", "INSERT INTO", "UPDATE", "DELETE", "JOIN", "LEFT JOIN", "RIGHT BY", "LIMIT", "VALUES", "SET"];
                let sql = input.replace(/\s+/g, " ");
                keywords.forEach(key => {
                    const regex = new RegExp(`\\b${key}\\b`, "gi");
                    sql = sql.replace(regex, `\n${key.toUpperCase()}`);
                });
                setOutput(sql.trim());
            }
        } catch (e: any) {
            setError(e.toString());
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <TabButton active={mode === "json"} label="JSON" onClick={() => setBeautifyMode("json")} />
                <TabButton active={mode === "xml"} label="XML" onClick={() => setBeautifyMode("xml")} />
                <TabButton active={mode === "sql"} label="SQL" onClick={() => setBeautifyMode("sql")} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[500px]">
                <textarea
                    className="textarea textarea-bordered font-mono text-xs h-full"
                    placeholder={`Paste ${mode.toUpperCase()} here...`}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                ></textarea>
                <div className="relative">
                    <pre className="p-4 bg-base-200 rounded-lg h-full overflow-auto font-mono text-xs whitespace-pre-wrap select-text">
                        {output || (error ? <span className="text-error">{error}</span> : "Output will appear here...")}
                    </pre>
                    <button className="btn btn-xs btn-primary absolute top-2 right-2" onClick={beautify}>Beautify</button>
                </div>
            </div>
        </div>
    );
};

const JwtDebugger = () => {
    const [token, setToken] = useState("");
    const [header, setHeader] = useState("");
    const [payload, setPayload] = useState("");
    const [error, setError] = useState<string | null>(null);

    const decode = () => {
        setError(null);
        try {
            const parts = token.split(".");
            if (parts.length !== 3) throw new Error("Invalid JWT format. Must have 3 parts.");

            const decodedHeader = JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/")));
            const decodedPayload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));

            setHeader(JSON.stringify(decodedHeader, null, 4));
            setPayload(JSON.stringify(decodedPayload, null, 4));
        } catch (e: any) {
            setError(e.toString());
            setHeader("");
            setPayload("");
        }
    };

    return (
        <div className="space-y-4">
            <textarea
                className="textarea textarea-bordered w-full font-mono text-xs h-24"
                placeholder="Paste JWT token here..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
            ></textarea>
            <button className="btn btn-primary btn-sm" onClick={decode}>Decode JWT</button>
            {error && <div className="alert alert-error py-2 text-sm text-white">{error}</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="label-text font-bold opacity-50 uppercase text-[10px]">Header</label>
                    <pre className="p-4 bg-base-200 rounded-lg min-h-[100px] overflow-auto font-mono text-xs whitespace-pre-wrap select-text">{header}</pre>
                </div>
                <div>
                    <label className="label-text font-bold opacity-50 uppercase text-[10px]">Payload</label>
                    <pre className="p-4 bg-base-200 rounded-lg min-h-[100px] overflow-auto font-mono text-xs whitespace-pre-wrap select-text">{payload}</pre>
                </div>
            </div>
        </div>
    );
};

const Base64Tool = () => {
    const [input, setInput] = useState("");
    const [output, setOutput] = useState("");

    const encode = () => setOutput(btoa(input));
    const decode = () => {
        try { setOutput(atob(input)); } catch (e) { setOutput("Invalid Base64 input"); }
    };

    return (
        <div className="space-y-4">
            <textarea className="textarea textarea-bordered w-full font-mono text-xs h-32" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Input text..."></textarea>
            <div className="flex gap-2">
                <button className="btn btn-primary btn-sm" onClick={encode}>Encode</button>
                <button className="btn btn-secondary btn-sm" onClick={decode}>Decode</button>
            </div>
            <pre className="p-4 bg-base-200 rounded-lg min-h-[100px] overflow-auto font-mono text-xs whitespace-pre-wrap select-text">{output}</pre>
        </div>
    );
};

const EncoderTool = () => {
    const [input, setInput] = useState("");
    const [output, setOutput] = useState("");

    const urlEncode = () => setOutput(encodeURIComponent(input));
    const urlDecode = () => setOutput(decodeURIComponent(input));
    const htmlEncode = () => {
        const div = document.createElement('div');
        div.textContent = input;
        setOutput(div.innerHTML);
    };
    const htmlDecode = () => {
        const div = document.createElement('div');
        div.innerHTML = input;
        setOutput(div.textContent || "");
    };

    return (
        <div className="space-y-4">
            <textarea className="textarea textarea-bordered w-full font-mono text-xs h-32" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Input text..."></textarea>
            <div className="flex flex-wrap gap-2">
                <button className="btn btn-outline btn-sm" onClick={urlEncode}>URL Encode</button>
                <button className="btn btn-outline btn-sm" onClick={urlDecode}>URL Decode</button>
                <button className="btn btn-outline btn-sm" onClick={htmlEncode}>HTML Encode</button>
                <button className="btn btn-outline btn-sm" onClick={htmlDecode}>HTML Decode</button>
            </div>
            <pre className="p-4 bg-base-200 rounded-lg min-h-[100px] overflow-auto font-mono text-xs whitespace-pre-wrap select-text">{output}</pre>
        </div>
    );
};

const EpochConverter = () => {
    const [epoch, setEpoch] = useState(Math.floor(Date.now() / 1000).toString());
    const [dateStr, setDateStr] = useState("");

    const convert = () => {
        try {
            const date = new Date(parseInt(epoch) * (epoch.length > 10 ? 1 : 1000));
            setDateStr(date.toString() + "\nISO: " + date.toISOString());
        } catch (e) {
            setDateStr("Invalid Epoch");
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-2 items-end">
                <div className="form-control flex-1">
                    <label className="label"><span className="label-text font-bold opacity-50 uppercase text-[10px]">Unix Timestamp</span></label>
                    <input type="text" className="input input-bordered" value={epoch} onChange={(e) => setEpoch(e.target.value)} />
                </div>
                <button className="btn btn-primary" onClick={convert}>Convert</button>
                <button className="btn btn-ghost" onClick={() => setEpoch(Math.floor(Date.now() / 1000).toString())}>Now</button>
            </div>
            <pre className="p-4 bg-base-200 rounded-lg min-h-[100px] font-mono text-sm select-text">{dateStr}</pre>
        </div>
    );
};

const CrontabVisualizer = () => {
    const [cron, setCron] = useState("* * * * *");
    const [explanation, setExplanation] = useState<any>(null);

    const labels = ["minute", "hour", "day (month)", "month", "day (week)"];
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const getHumanReadable = (part: string, index: number) => {
        if (part === "*") return "every " + labels[index];
        
        const isStep = part.includes("/");
        const isRange = part.includes("-");
        const isList = part.includes(",");

        const formatVal = (v: string) => {
            const num = parseInt(v);
            if (index === 3 && !isNaN(num)) return monthNames[num] || v;
            if (index === 4 && !isNaN(num)) return dayNames[num] || v;
            return v;
        };

        if (isList) {
            const parts = part.split(",").map(formatVal);
            const last = parts.pop();
            return `at ${labels[index]} ${parts.join(", ")} and ${last}`;
        }

        if (isStep) {
            const [range, step] = part.split("/");
            if (range === "*") return `every ${step} ${labels[index]}s`;
            return `every ${step} ${labels[index]}s from ${formatVal(range.split("-")[0])} through ${formatVal(range.split("-")[1] || "")}`;
        }

        if (isRange) {
            const [start, end] = part.split("-").map(formatVal);
            return `every ${labels[index]} from ${start} through ${end}`;
        }

        return `at ${labels[index]} ${formatVal(part)}`;
    };

    const visualize = () => {
        const parts = cron.trim().split(/\s+/);
        if (parts.length !== 5) {
            setExplanation({ error: "Invalid Cron format. Need 5 parts: minute hour day month day-of-week" });
            return;
        }

        const descriptions = parts.map((p, i) => getHumanReadable(p, i));
        
        // Build a combined sentence
        let sentence = "“";
        const [min, hour, day, month, dow] = parts;

        if (min === "*" && hour === "*" && day === "*" && month === "*" && dow === "*") {
            sentence += "Every minute";
        } else {
            // Very basic sentence construction logic
            sentence += "At ";
            if (min !== "*") sentence += getHumanReadable(min, 0).replace("at minute ", "") + " minute ";
            else sentence += "every minute ";

            if (hour !== "*") sentence += "of " + getHumanReadable(hour, 1).replace("at hour ", "") + " hour ";
            if (day !== "*") sentence += "on " + getHumanReadable(day, 2).replace("at day (month) ", "") + " day of month ";
            if (month !== "*") sentence += "in " + getHumanReadable(month, 3).replace("at month ", "") + " ";
            if (dow !== "*") sentence += "on " + getHumanReadable(dow, 4).replace("at day (week) ", "") + " ";
        }
        
        sentence += "”";

        setExplanation({
            parts: parts.map((p, i) => ({ val: p, label: labels[i], desc: descriptions[i] })),
            sentence: sentence.replace(/\s+/g, ' ').replace(/ ”$/, "”")
        });
    };

    useEffect(() => {
        visualize();
    }, [cron]);

    return (
        <div className="space-y-6">
            <div className="form-control w-full">
                <label className="label">
                    <span className="label-text font-bold opacity-50 uppercase text-[10px] tracking-widest">Cron Expression</span>
                </label>
                <input 
                    type="text" 
                    className="input input-bordered input-lg font-mono text-2xl text-center tracking-[0.2em] focus:input-primary bg-base-200" 
                    value={cron} 
                    onChange={(e) => setCron(e.target.value)}
                    placeholder="* * * * *" 
                />
            </div>

            {explanation?.error ? (
                <div className="alert alert-error py-2 text-sm text-white">{explanation.error}</div>
            ) : explanation ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="text-center p-6 bg-primary/5 rounded-2xl border-2 border-primary/10">
                        <p className="text-2xl font-medium text-primary leading-relaxed italic">
                            {explanation.sentence}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                        {explanation.parts.map((p: any, i: number) => (
                            <div key={i} className="card bg-base-200 border border-base-300 shadow-sm overflow-hidden">
                                <div className="bg-base-300 px-3 py-1 text-[10px] font-black uppercase opacity-50 text-center tracking-tighter">
                                    {p.label}
                                </div>
                                <div className="p-3 text-center">
                                    <div className="text-xl font-mono font-bold text-primary mb-1">{p.val}</div>
                                    <div className="text-[10px] leading-tight opacity-70 font-medium h-8 flex items-center justify-center uppercase">
                                        {p.desc.replace(/at |every /g, "")}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="bg-base-200 p-4 rounded-xl border border-base-300 text-[11px] opacity-60 font-mono">
                        <div className="grid grid-cols-2 gap-2">
                            <div>* : every value</div>
                            <div>- : range of values</div>
                            <div>, : list of values</div>
                            <div>/ : step values</div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

const RegexTester = () => {
    const [pattern, setRegexPattern] = useState("");
    const [flags, setFlags] = useState("g");
    const [text, setText] = useState("");
    const [results, setResults] = useState<any[]>([]);

    const testRegex = () => {
        try {
            const re = new RegExp(pattern, flags);
            const matches = [...text.matchAll(re)];
            setResults(matches);
        } catch (e) {
            setResults([{ error: true, message: String(e) }]);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <div className="form-control flex-1">
                    <label className="label"><span className="label-text font-bold opacity-50 uppercase text-[10px]">Pattern</span></label>
                    <div className="join w-full">
                        <span className="join-item btn btn-sm no-animation bg-base-300">/</span>
                        <input type="text" className="input input-bordered input-sm join-item flex-1 font-mono" value={pattern} onChange={e => setRegexPattern(e.target.value)} placeholder="[a-z]+" />
                        <span className="join-item btn btn-sm no-animation bg-base-300">/</span>
                        <input type="text" className="input input-bordered input-sm join-item w-20 font-mono" value={flags} onChange={e => setFlags(e.target.value)} placeholder="gi" />
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-control">
                    <label className="label"><span className="label-text font-bold opacity-50 uppercase text-[10px]">Test Text</span></label>
                    <textarea className="textarea textarea-bordered h-48 font-mono text-xs" value={text} onChange={e => setText(e.target.value)}></textarea>
                </div>
                <div>
                    <label className="label"><span className="label-text font-bold opacity-50 uppercase text-[10px]">Matches</span></label>
                    <div className="bg-base-200 rounded-lg h-48 overflow-auto p-2 font-mono text-xs">
                        {results.map((m, i) => (
                            m.error ? <div key={i} className="text-error">{m.message}</div> :
                            <div key={i} className="mb-2 p-1 border-b border-base-300">
                                <div className="font-bold text-primary">Match {i+1}: {m[0]}</div>
                                <div className="opacity-50">Index: {m.index}</div>
                            </div>
                        ))}
                        {results.length === 0 && <div className="opacity-30 italic">No matches</div>}
                    </div>
                </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={testRegex}>Run Regex</button>
        </div>
    );
};

export const Tools = () => {
    const [activeTool, setActiveTool] = useState("beautifier");

    const tools = [
        { id: "beautifier", name: "Beautifier", icon: "✨" },
        { id: "jwt", name: "JWT Debugger", icon: "🔑" },
        { id: "base64", name: "Base64", icon: "📦" },
        { id: "encoder", name: "Encoding", icon: "🔗" },
        { id: "epoch", name: "Unix Epoch", icon: "🕒" },
        { id: "cron", name: "Crontab", icon: "⏲️" },
        { id: "regex", name: "Regex", icon: "🔍" },
    ];

    return (
        <div className="flex flex-col h-full bg-base-100 overflow-hidden rounded-xl border border-base-300 shadow-sm animate-in slide-in-from-bottom-4 duration-500">
            <div className="p-4 border-b border-base-300 bg-base-200/30 shrink-0">
                <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-1">
                    {tools.map(tool => (
                        <button
                            key={tool.id}
                            className={`btn btn-sm whitespace-nowrap ${activeTool === tool.id ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setActiveTool(tool.id)}
                        >
                            <span>{tool.icon}</span>
                            {tool.name}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-base-100">
                {activeTool === "beautifier" && <Beautifier />}
                {activeTool === "jwt" && <JwtDebugger />}
                {activeTool === "base64" && <Base64Tool />}
                {activeTool === "encoder" && <EncoderTool />}
                {activeTool === "epoch" && <EpochConverter />}
                {activeTool === "cron" && <CrontabVisualizer />}
                {activeTool === "regex" && <RegexTester />}
            </div>
        </div>
    );
};
