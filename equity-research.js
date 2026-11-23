(function () {
  "use strict";
  const rates = ["grossMargin","operatingMargin","netMargin","fcfMargin","roa","roe","cashConversion","effectiveTax","rndIntensity","sbcIntensity","capexIntensity","returnOfCapital"];
  const multiples = ["currentRatio","quickRatio","cashRatio","debtEquity","liabilitiesAssets","interestCoverage","assetTurnover"];
  const fields = {
    revenue:["Revenue","Reported total revenue."], costSales:["Cost of sales","Reported direct costs of sales."],
    grossProfit:["Gross profit","Revenue less cost of sales, as reported."],
    ebit:["Operating income","Reported operating profit before interest and taxes."],
    interestExpense:["Interest expense","Reported interest expense."], pretax:["Pre-tax income","Reported income before income taxes."],
    taxExpense:["Income tax expense","Reported tax provision."],
    netIncome:["Net income","Reported consolidated net income."], eps:["Diluted EPS","Reported earnings per diluted share. Half-year values sum two quarters and may differ from reported half-year EPS."],
    dilutedShares:["Weighted-average diluted shares","Reported period-average diluted shares; not summed for a half-year."],
    rnd:["Research and development","Reported R&D expense, where disclosed."],
    cash:["Cash and equivalents","Period-end cash and cash equivalents."], shortInvestments:["Short-term investments","Period-end short-term investments."],
    receivables:["Accounts receivable","Period-end accounts receivable."], inventory:["Inventory","Period-end inventory."],
    currentAssets:["Current assets","Reported period-end current assets."], assets:["Total assets","Reported period-end total assets."],
    currentLiabilities:["Current liabilities","Reported period-end current liabilities."], liabilities:["Total liabilities","Reported period-end total liabilities."],
    shortDebt:["Short-term debt","Reported short-term debt."], longDebt:["Long-term debt","Reported long-term debt."],
    totalDebt:["Total debt","Reported total debt, or short- and long-term debt combined when both are available."],
    equity:["Shareholders’ equity","Reported period-end shareholders’ equity."],
    ocf:["Operating cash flow","Net cash from operating activities."], capex:["Capital expenditure","Absolute value of cash purchases of property, plant and equipment."],
    da:["Depreciation and amortisation","Reported cash-flow statement adjustment."],
    sbc:["Share-based compensation","Reported cash-flow adjustment for share-based pay."],
    investingCF:["Investing cash flow","Reported net cash flow from investing."],
    financingCF:["Financing cash flow","Reported net cash flow from financing."],
    dividends:["Common dividends paid","Cash dividends paid, with outflows shown positive."],
    buybacks:["Share repurchases","Cash repurchases, with outflows shown positive."],
    grossMargin:["Gross margin","Gross profit ÷ revenue. Measures how much sales retain after direct costs."],
    operatingMargin:["Operating margin","Operating income ÷ revenue. Shows operating profitability before financing and tax."],
    netMargin:["Net margin","Net income ÷ revenue. Includes non-operating items and tax."],
    fcf:["Free cash flow","Operating cash flow minus cash capital expenditure. A simple, non-GAAP measure; it is not necessarily management’s definition."],
    fcfMargin:["Free cash flow margin","Free cash flow ÷ revenue. Shows cash left after cash capital expenditure per unit of sales."],
    cashConversion:["Operating cash / net income","Operating cash flow ÷ positive net income. Working capital movements and one-offs can shift it."],
    sbcIntensity:["Share-based pay / revenue","Share-based compensation ÷ revenue. A noncash expense that may dilute shareholders."],
    capexIntensity:["Capital expenditure / revenue","Cash capital expenditure ÷ revenue. Useful for following the firm’s capital intensity."],
    returnOfCapital:["Dividends + buybacks / FCF","Common cash dividends plus share repurchases ÷ positive free cash flow. A ratio above 100% means those outflows exceeded free cash flow for the period."],
    assetTurnover:["Asset turnover","Revenue ÷ average beginning and ending assets. Not annualised."],
    ebitda:["EBITDA proxy","Operating income plus cash-flow statement depreciation and amortisation. A rough non-GAAP proxy, not management’s adjusted EBITDA."],
    rndIntensity:["R&D / revenue","Absolute R&D expense ÷ revenue. Capitalisation and classification vary by issuer."],
    effectiveTax:["Effective tax rate","Reported tax expense ÷ positive pre-tax income."],
    roa:["Return on assets","Net income ÷ average of beginning and ending total assets. Not annualised."],
    roe:["Return on equity","Net income ÷ average of positive beginning and ending shareholder equity. Not annualised; leverage can raise it."],
    currentRatio:["Current ratio","Current assets ÷ current liabilities. Check the quality and timing of both."],
    quickRatio:["Quick ratio","(Cash + short-term investments + receivables) ÷ current liabilities. Hidden if an input is missing."],
    cashRatio:["Cash ratio","Cash and equivalents ÷ current liabilities."],
    debtEquity:["Debt / equity","Total debt ÷ positive shareholders’ equity."],
    liabilitiesAssets:["Liabilities / assets","Total liabilities ÷ total assets. Includes operating liabilities, not just borrowings."],
    interestCoverage:["Interest coverage","Operating income ÷ absolute interest expense."],
    netDebt:["Net debt","Total debt less cash and equivalents; short-term investments are not deducted."],
  };
  const sections = [
    ["Operating performance",["revenue","grossProfit","ebit","ebitda","netIncome","eps","grossMargin","operatingMargin","netMargin","rndIntensity","effectiveTax"]],
    ["Returns and financial health",["roa","roe","assetTurnover","currentRatio","quickRatio","cashRatio","debtEquity","liabilitiesAssets","interestCoverage","totalDebt","netDebt"]],
    ["Cash flow and capital allocation",["ocf","capex","fcf","fcfMargin","cashConversion","capexIntensity","sbcIntensity","dividends","buybacks","returnOfCapital","investingCF","financingCF"]],
  ];
  const statements = [
    ["Income statement",["revenue","costSales","grossProfit","ebit","interestExpense","pretax","taxExpense","netIncome","eps","dilutedShares","rnd"]],
    ["Balance sheet",["cash","shortInvestments","receivables","inventory","currentAssets","assets","currentLiabilities","liabilities","shortDebt","longDebt","totalDebt","equity"]],
    ["Cash flow statement",["ocf","capex","da","sbc","investingCF","financingCF","dividends","buybacks"]]
  ];
  const flowFields = new Set([...statements[0][1], ...statements[2][1]].filter(k=>k!=="dilutedShares"));
  const periods = {quarterly:"Quarterly",semi:"Semi-annual",annual:"Annual"};
  const state = {period:"quarterly",tab:"ratios",symbol:"",name:"",data:null,news:null,err:"",newsErr:"",query:"",results:[]};
  let root, timer, request, selectRequest;
  const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const number = n => typeof n === "number" && Number.isFinite(n);
  const plus = (a,b) => number(a)&&number(b) ? a+b : null;
  const minus = (a,b) => number(a)&&number(b) ? a-b : null;
  const abs = a => number(a) ? Math.abs(a) : null;
  const ratio = (a,b) => number(a)&&number(b)&&b>0 ? a/b : null;
  const round = (n,d=2) => new Intl.NumberFormat("en-GB",{maximumFractionDigits:d,minimumFractionDigits:d}).format(n);
  const short = n => {
    const a=Math.abs(n);return a>=1e12?round(n/1e12,2)+"T":a>=1e9?round(n/1e9,2)+"B":a>=1e6?round(n/1e6,2)+"M":a>=1e3?round(n/1e3,1)+"K":round(n,2);
  };
  const format = (key,n) => !number(n)?"—":rates.includes(key)?round(n*100,1)+"%":multiples.includes(key)?round(n)+"×":key==="eps"?round(n):short(n);
  const date = s => {
    if (!s) return "—";
    const d=new Date(s.length===10?s+"T00:00:00Z":s);
    return Number.isNaN(+d)?"—":new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(d);
  };
  const time = s => {
    if(!s)return "Timestamp not supplied";
    const d=new Date(String(s).replace(" UTC","Z").replace(" ","T"));
    return Number.isNaN(+d)?s:date(d.toISOString())+" · "+d.toISOString().slice(11,16)+" UTC";
  };
  const safeLink = u => {try{const x=new URL(u);return x.protocol==="https:"?esc(x.href):""}catch{return ""}};
  const href = (u,label) => {const safe=safeLink(u);return safe?`<a href="${safe}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`:""};
  const financeLink = symbol => "https://www.perplexity.ai/finance/"+encodeURIComponent(symbol);
  const yahooLink = symbol => "https://finance.yahoo.com/quote/"+encodeURIComponent(symbol)+"/news/";
  const provider = "Perplexity Finance";

  function api(path,signal) {
    const raw=window.KETONDA_EQUITY_API;
    const local=/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    if(!raw || (raw.startsWith("__PORT_")&&!local)) return Promise.reject(Error("The equity data service is not connected in this copy."));
    return fetch((raw.startsWith("__PORT_")?"":raw.replace(/\/$/,""))+"/api/equity/"+path,{signal,credentials:"same-origin"})
      .then(async r=>{
        if(!r.ok){const j=await r.json().catch(()=>({}));throw Error(j.detail&&typeof j.detail==="string"?j.detail:"The data service is temporarily unavailable. Please try again.");}
        return r.json();
      });
  }
  function sequence(p,mode) {return mode==="quarterly"?p.year*4+p.quarter:mode==="semi"?p.year*2+p.half:p.year}
  function isAdjacent(a,b,mode) {
    if(!a||!b||sequence(a,mode)-sequence(b,mode)!==1)return false;
    const days=(new Date(a.end)-new Date(b.end))/86400000;
    return mode==="quarterly"? days>=65&&days<=125 : mode==="semi"?days>=145&&days<=225:days>=320&&days<=410;
  }
  function halfYears(quarters) {
    return quarters.filter(q=>q.quarter===2||q.quarter===4).flatMap(last=>{
      const first=quarters.find(q=>q.year===last.year&&last.quarter-q.quarter===1);
      if(!isAdjacent(last,first,"quarterly")) return [];
      const half=last.quarter/2,values={};
      for(const key of flowFields) values[key]=plus(first.values[key],last.values[key]);
      for(const key of statements[1][1]) values[key]=last.values[key];
      if(!number(values.totalDebt)) values.totalDebt=plus(last.values.shortDebt,last.values.longDebt);
      return [{year:last.year,half,end:last.end,label:`FY${last.year} H${half}`,values}];
    });
  }
  function selectPeriods(data,mode) {
    const quarters=data?.quarterly?.periods || [];
    const list=mode==="annual"?(data?.annual?.periods||[]):mode==="semi"?halfYears(quarters):quarters;
    const first=list[0], prev=list.find(p=>isAdjacent(first,p,mode)), earlier=list.find(p=>isAdjacent(prev,p,mode));
    return {first,prev,earlier,list};
  }
  function metrics(p,previous) {
    if(!p)return {};
    const v={...p.values}, b=previous?.values||{};
    for(const key of ["capex","dividends","buybacks"])v[key]=abs(v[key]);
    v.totalDebt=v.totalDebt??plus(v.shortDebt,v.longDebt);
    v.fcf=minus(v.ocf,v.capex);
    v.ebitda=plus(v.ebit,abs(v.da));
    v.netDebt=minus(v.totalDebt,v.cash);
    v.grossMargin=ratio(v.grossProfit,v.revenue);
    v.operatingMargin=ratio(v.ebit,v.revenue);
    v.netMargin=ratio(v.netIncome,v.revenue);
    v.fcfMargin=ratio(v.fcf,v.revenue);
    v.cashConversion=ratio(v.ocf,v.netIncome);
    v.capexIntensity=ratio(v.capex,v.revenue);
    v.returnOfCapital=ratio(plus(v.dividends,v.buybacks),v.fcf);
    v.sbcIntensity=ratio(abs(v.sbc),v.revenue);
    v.rndIntensity=ratio(abs(v.rnd),v.revenue);
    v.effectiveTax=ratio(v.taxExpense,v.pretax);
    v.roa=ratio(v.netIncome,number(v.assets)&&number(b.assets)&&v.assets>0&&b.assets>0?(v.assets+b.assets)/2:null);
    v.assetTurnover=ratio(v.revenue,number(v.assets)&&number(b.assets)&&v.assets>0&&b.assets>0?(v.assets+b.assets)/2:null);
    v.roe=ratio(v.netIncome,number(v.equity)&&number(b.equity)&&v.equity>0&&b.equity>0?(v.equity+b.equity)/2:null);
    v.currentRatio=ratio(v.currentAssets,v.currentLiabilities);
    v.quickRatio=ratio(plus(plus(v.cash,v.shortInvestments),v.receivables),v.currentLiabilities);
    v.cashRatio=ratio(v.cash,v.currentLiabilities);
    v.debtEquity=ratio(v.totalDebt,v.equity);
    v.liabilitiesAssets=ratio(v.liabilities,v.assets);
    v.interestCoverage=ratio(v.ebit,abs(v.interestExpense));
    return v;
  }
  function delta(k,a,b) {
    if(!number(a)||!number(b))return "—";
    const diff=a-b, prefix=diff>0?"+":"";
    if(rates.includes(k)) return prefix+round(diff*100,1)+" pp";
    if(multiples.includes(k)) return prefix+round(diff)+"×";
    if(b>0&&a>=0) return prefix+round(diff/b*100,1)+"%";
    return prefix+(k==="eps"?round(diff):short(diff))+" abs.";
  }
  function remarks(m,p) {
    const rows=[];
    if(number(m.revenue)&&number(p.revenue)&&p.revenue>0) {
      const change=(m.revenue/p.revenue-1)*100;
      rows.push(["Sales",`Revenue was ${short(m.revenue)}, ${Math.abs(change)<0.05?"little changed":`${round(Math.abs(change),1)}% ${change>0?"higher":"lower"}`} versus the prior period.`]);
    }
    if(number(m.operatingMargin)&&number(p.operatingMargin)){
      const gap=(m.operatingMargin-p.operatingMargin)*100;
      rows.push(["Profitability",`Operating margin was ${format("operatingMargin",m.operatingMargin)} versus ${format("operatingMargin",p.operatingMargin)} (${gap>0?"+":""}${round(gap,1)} pp). Check the filings for what drove the change.`]);
    }
    if(number(m.fcf)) rows.push(["Cash generation",`Operating cash flow ${short(m.ocf)} less ${short(m.capex)} of cash capital expenditure left ${short(m.fcf)} in free cash flow${number(p.fcf)?`, versus ${short(p.fcf)} previously`:""}.`]);
    if(number(m.currentRatio))rows.push(["Liquidity",`Current assets covered current liabilities ${format("currentRatio",m.currentRatio)} at period end. This measures balance-sheet coverage, not the timing of cash receipts or payments.`]);
    return rows;
  }
  function table(groups,c,p,a,b,raw=false) {
    const caption=raw?"Underlying company statement metrics":"Company ratio and metric comparison";
    return `<div class="er-tablewrap" tabindex="0" role="region" aria-label="${caption}"><table class="er-table"><caption class="er-sr">${caption}</caption><thead><tr><th scope="col">Metric</th><th scope="col">Latest <b>${esc(c?.label||"—")}</b></th><th scope="col">Previous <b>${esc(p?.label||"—")}</b></th>${raw?"":"<th scope='col'>Change</th>"}</tr></thead>`
      +groups.map(([title,keys])=>`<tbody><tr class="er-group"><th scope="rowgroup" colspan="${raw?3:4}">${esc(title)}</th></tr>`
      +keys.map(key=>`<tr><th scope="row">${esc(fields[key][0])}${raw?"":`<details class="er-formula"><summary>Formula</summary><p>${esc(fields[key][1])}</p></details>`}</th><td>${format(key,a[key])}</td><td>${format(key,b[key])}</td>${raw?"":`<td class="er-change">${delta(key,a[key],b[key])}</td>`}</tr>`).join("")+"</tbody>").join("")+"</table></div>";
  }
  function quotePanel(q) {
    if(!q)return `<div class="er-card er-quiet">A market quote was not supplied for this listing. Financial statements may still be available.</div>`;
    function chip(label,value,hint){return `<div class="er-kpi"><div>${label}</div><strong>${value}</strong><small>${hint}</small></div>`;}
    const cc=esc(q.currency||"");
    const change=number(q.changesPercentage)?(q.changesPercentage>0?"+":"")+round(q.changesPercentage)+"% vs prior close":"Change not supplied";
    const tape=[number(q.yearLow)&&number(q.yearHigh)?`52-week range ${cc} ${round(q.yearLow)} to ${round(q.yearHigh)}`:"",number(q.volume)?`Session volume ${short(q.volume)}${number(q.avgVolume)?" (average "+short(q.avgVolume)+")":""}`:""].filter(Boolean).join(" · ");
    return `<section aria-label="Market snapshot"><div class="er-kpis">
      ${chip("Latest quote",number(q.price)?`${cc} ${round(q.price)}`:"—",change)}
      ${chip("Market capitalisation",number(q.marketCap)?`${cc} ${short(q.marketCap)}`:"—","Provider snapshot")}
      ${chip("Trailing P/E",number(q.pe)&&q.pe>0?round(q.pe)+"×":"—","Provider-reported multiple")}
      ${chip("Trailing dividend yield",number(q.dividendYieldTTM)?round(100*q.dividendYieldTTM,2)+"%":"—","Provider-reported yield")}
      </div>${tape?`<p class="er-note">${tape}</p>`:""}<p class="er-note">Quote as of ${esc(time(q.timestamp))}. Quotes may be delayed or reflect the previous market session. Source: ${href(financeLink(state.symbol),provider)}.</p></section>`;
  }
  function financialBody() {
    const box=root.querySelector("#er-finbody");
    if(!box||!state.data)return;
    const d=state.data, {first,prev,earlier}=selectPeriods(d,state.period);
    const curr=metrics(first,prev), prior=metrics(prev,earlier);
    const curLabel=(state.period==="annual"?d.annual:d.quarterly)?.currency;
    let explanation = state.period==="annual"?"Compares consecutive completed fiscal years."
      : state.period==="semi"?"Compares completed fiscal half-years (Q1 + Q2 or Q3 + Q4). Cash flows and income are added; balance-sheet values come from the period end. Half-year EPS is approximate."
      :"Compares consecutive fiscal quarters. Seasonal businesses may not be directly comparable quarter to quarter.";
    if(curLabel==="mixed")explanation+=" Reporting currencies differ across observations, so financial comparisons are withheld.";
    const panel=state.tab==="ratios"?"Ratios & metrics":"Financial statements";
    box.innerHTML=`<div class="er-toolbar"><div><h3>Fiscal period comparison</h3><p class="er-note">${explanation}</p></div>
      <label for="er-period">Frequency<select id="er-period">${Object.entries(periods).map(([k,n])=>`<option value="${k}"${state.period===k?" selected":""}>${n}</option>`).join("")}</select></label></div>
      ${first&&curLabel!=="mixed"?`<p class="er-perioddates"><b>Latest:</b> ${first.label} · ends ${date(first.end)} <span><b>Previous:</b> ${prev?`${prev.label} · ends ${date(prev.end)}`:"No adjacent period available"}</span></p>
        <div class="er-actions"><div class="er-tabs" aria-label="Financial data view">${[["ratios","Ratios & metrics"],["raw","Financial statements"]].map(([k,n])=>`<button type="button" class="bt" data-er-tab="${k}" aria-pressed="${state.tab===k}">${n}</button>`).join("")}</div>
        <button class="bt" type="button" data-er-export>Download statement CSV</button></div>
        <p class="er-note">${curLabel?`Statement currency: ${esc(curLabel)}.`:"Amounts use the company’s reporting currency as delivered by the provider; a currency code was not supplied."} K = thousand, M = million, B = billion, T = trillion. ${state.tab==="ratios"?"Change uses percentage points for rates, turns for multiples and absolute change where percentage growth would be misleading. “—” means unavailable or not meaningful.":"The table shows input figures, with cash outflows for capex, dividends and repurchases shown as positive. Total debt may be derived from both reported debt components."}</p>
        ${state.tab==="ratios"&&remarks(curr,prior).length?`<section class="er-insights" aria-label="What changed">${remarks(curr,prior).map(([label,body])=>`<div><b>${label}</b><p>${esc(body)}</p></div>`).join("")}</section>`:""}
        <p class="er-note er-scrollhint">Swipe or scroll the table sideways to see all columns.</p>
        ${table(state.tab==="ratios"?sections:statements,first,prev,curr,prior,state.tab==="raw")}
        <p class="er-note">Statement data: ${href(financeLink(state.symbol),provider)}. Definitions and coverage vary by issuer. Bank, insurer and REIT analysis often requires industry-specific metrics; a missing ratio is not a zero.</p>`
        :`<div class="er-empty">${curLabel==="mixed"?"A like-for-like comparison isn’t available for mixed reporting currencies.":`No ${periods[state.period].toLowerCase()} financial statements are available for this listing. Try another frequency or review the company’s financial reports.`}</div>`}
      <span class="er-sr" role="status">${esc(panel)} · ${periods[state.period]}${first?" · "+first.label:""}</span>`;
  }
  function newsBody() {
    const box=root?.querySelector("#er-newsbody");
    if(!box)return;
    if(state.newsErr) {
      box.innerHTML=`<div class="er-empty">${esc(state.newsErr)} <button type="button" class="bt" data-er-retry-news>Retry news</button></div>`;
      return;
    }
    if(!state.news) {box.innerHTML='<p class="er-note" role="status">Loading the latest headlines…</p>';return;}
    if(!state.news.articles.length) {box.innerHTML='<div class="er-empty">The feed has no recent headlines for this listing.</div>';return;}
    box.innerHTML=`<ul class="er-newslist">${state.news.articles.map(a=>`<li><div>${esc(a.publisher)} <time datetime="${esc(a.date)}">${date(a.date)}</time></div>${href(a.url,a.title)}</li>`).join("")}</ul>`;
  }
  function renderCompany() {
    const out=root?.querySelector("#er-output");
    if(!out)return;
    if(!state.symbol){out.innerHTML='<div class="er-empty">Select a company to see its latest quote, fiscal comparisons, source statements and news.</div>';return;}
    if(state.err){out.innerHTML=`<div class="er-empty" role="alert">${esc(state.err)} <button class="bt" type="button" data-er-retry>Try again</button></div>`;return;}
    if(!state.data){out.innerHTML=`<div class="er-empty" role="status">Loading the quote and financial statements for ${esc(state.symbol)}…</div>`;return;}
    const data=state.data, p=data.profile||{}, q=data.quote;
    const name=p.companyName||q?.name||state.name||state.symbol;
    const desc=p.description||"", cut=desc.length>430;
    const intro=cut?desc.slice(0,430).replace(/\s+\S*$/,"")+"…":desc;
    out.innerHTML=`<section class="er-company" aria-label="Selected company"><div class="er-company-top"><div>
      <div class="er-label">${esc([state.symbol,p.sector,p.country].filter(Boolean).join(" · "))}</div><h2>${esc(name)}</h2>
      ${p.industry?`<p>${esc(p.industry)}</p>`:""}</div><div class="er-company-links">${href(p.website,"Company website")} ${href(financeLink(state.symbol),"Finance profile")}</div></div>
      ${quotePanel(q)}
      ${intro?`<div class="er-profile"><h3>Business overview</h3><p>${esc(intro)}</p>${cut?`<details><summary>Read full company profile</summary><p>${esc(desc)}</p></details>`:""}</div>`:""}
      </section>
      <section class="er-card" id="er-finbody" aria-label="Fiscal period comparison"></section>
      <section class="er-card" aria-label="Latest company news"><div class="er-toolbar"><div><h3>Latest company news</h3><p class="er-note">Yahoo Finance headlines that name the company or ticker, newest first.</p></div>${href(yahooLink(state.symbol),"Open news feed")}</div><div id="er-newsbody"></div></section>`;
    financialBody();newsBody();
  }
  function download() {
    if(!state.data)return;
    const {first,prev}=selectPeriods(state.data,state.period);
    if(!first)return;
    const a=metrics(first),b=metrics(prev);
    const unit=(state.period==="annual"?state.data.annual:state.data.quarterly)?.currency||"Company reporting currency";
    const rows=[["Symbol",state.symbol],["Source",provider],["Source URL",financeLink(state.symbol)],
      ["Mode",periods[state.period]],["Monetary units",unit+" (unscaled)"],["Retrieved",state.data.retrievedAt],
      ["Statement","Metric",first.label,prev?.label||"No previous period"],["","","Ends "+first.end,prev?"Ends "+prev.end:""]];
    for(const [group,keys] of statements)for(const k of keys)rows.push([group,fields[k][0],a[k]??"",b[k]??""]);
    const csv=rows.map(row=>row.map(c=>`"${String(c??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
    const url=URL.createObjectURL(new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"}));
    const link=document.createElement("a");
    link.href=url;link.download=state.symbol+"-"+state.period+"-financial-statements.csv";
    root.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
  }
  function resultList(message="") {
    if(!root)return;
    const status=root.querySelector("#er-search-status"), list=root.querySelector("#er-results");
    if(!status||!list)return;
    status.textContent=message;
    list.innerHTML=state.results.map((r,i)=>`<li><button type="button" data-er-choice="${i}"><b>${esc(r.symbol)}</b><span>${esc(r.name)}</span><span aria-hidden="true">↗</span></button></li>`).join("");
  }
  async function getResults(query) {
    if(!root?.isConnected||query!==state.query)return;
    request?.abort();request=new AbortController();const thisRequest=request;
    resultList("Searching stocks…");
    try{
      const d=await api("search?"+new URLSearchParams({q:query}),request.signal);
      if(thisRequest!==request||query!==state.query)return;
      state.results=d.results||[];resultList(state.results.length?"Select a result to open its analysis.":"No matching company or ticker was found.");
    }catch(e){if(e.name!=="AbortError"&&thisRequest===request&&query===state.query)resultList(e.message);}
  }
  function loadNews(symbol,token){
    state.news=null;state.newsErr="";newsBody();
    api("news/"+encodeURIComponent(symbol),token.signal).then(data=>{
      if(token!==selectRequest)return;state.news=data;newsBody();
    }).catch(e=>{if(token===selectRequest&&e.name!=="AbortError"){state.newsErr=e.message;newsBody();}});
  }
  function select(symbol,name) {
    clearTimeout(timer);request?.abort();selectRequest?.abort();
    const token=selectRequest=new AbortController();
    state.symbol=symbol;state.name=name||symbol;state.data=null;state.err="";state.tab="ratios";
    state.results=[];state.query=symbol;root.querySelector("#er-query").value=symbol;
    resultList();renderCompany();loadNews(symbol,token);
    api("company/"+encodeURIComponent(symbol),token.signal).then(data=>{
      if(token!==selectRequest)return;
      state.data=data;renderCompany();
      if(!root.hidden&&root.isConnected){const h=root.querySelector(".er-company h2");h?.setAttribute("tabindex","-1");h?.focus({preventScroll:true});}
    }).catch(e=>{if(token===selectRequest&&e.name!=="AbortError"){state.err=e.message;renderCompany();}});
  }
  function mount(node) {
    root=node;
    root.innerHTML=`<section class="er-search" aria-labelledby="er-search-title"><div class="er-label">Equity research</div><h2 id="er-search-title">Research a listed company</h2>
      <p>Search by name or ticker to load market data, compare financial periods, and see the latest company news.</p>
      <form id="er-search-form" role="search"><label for="er-query">Company name or ticker</label><div class="er-search-row">
      <input id="er-query" type="search" maxlength="80" autocomplete="off" placeholder="e.g. Microsoft or MSFT" aria-describedby="er-search-status" value="${esc(state.query)}"><button class="bt p" type="submit">Search</button></div></form>
      <p id="er-search-status" role="status" class="er-search-status"></p><ul id="er-results" class="er-results" aria-label="Stock search results"></ul></section><div id="er-output"></div>`;
    root.oninput=e=>{
      if(e.target.id!=="er-query")return;
      state.query=e.target.value.trim();state.results=[];resultList();clearTimeout(timer);request?.abort();
      if(state.query)timer=setTimeout(()=>getResults(state.query),450);
    };
    root.onsubmit=e=>{
      if(e.target.id!=="er-search-form")return;
      e.preventDefault();clearTimeout(timer);
      if(state.results.length===1){const r=state.results[0];select(r.symbol,r.name)}
      else if(state.query)getResults(state.query);
      else resultList("Enter a company name or ticker.");
    };
    root.onkeydown=e=>{
      const buttons=[...root.querySelectorAll("[data-er-choice]")];
      if(!buttons.length)return;
      const where=buttons.indexOf(e.target);
      if((e.key==="ArrowDown"||e.key==="ArrowUp")&&(e.target.id==="er-query"||where>=0)){
        e.preventDefault();buttons[where<0?(e.key==="ArrowDown"?0:buttons.length-1):(where+(e.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length].focus();
      }
      if(e.key==="Escape"&&(e.target.id==="er-query"||where>=0)){
        state.results=[];resultList();root.querySelector("#er-query").focus();
      }
    };
    root.onchange=e=>{
      if(e.target.id!=="er-period"||!periods[e.target.value])return;
      state.period=e.target.value;financialBody();root.querySelector("#er-period").focus();
    };
    root.onclick=e=>{
      const b=e.target.closest("button");if(!b)return;
      if(b.hasAttribute("data-er-choice")){const r=state.results[Number(b.dataset.erChoice)];if(r)select(r.symbol,r.name);}
      else if(b.hasAttribute("data-er-tab")){state.tab=b.dataset.erTab;financialBody();root.querySelector(`[data-er-tab=${state.tab}]`)?.focus();}
      else if(b.hasAttribute("data-er-export"))download();
      else if(b.hasAttribute("data-er-retry"))select(state.symbol,state.name);
      else if(b.hasAttribute("data-er-retry-news"))loadNews(state.symbol,selectRequest);
    };
    resultList();renderCompany();
  }
  window.KetondaEquity = {mount, selectPeriods, metrics};
}());
