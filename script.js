        const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwi1bgpMrZfVmypXdfs3W8S-lvXSAVDYUe9AhtKZMztA4BdPwsv79w95ASw9K5ajJzG/exec"; 
        const DRIVE_FOLDER_ID = "16ikf8C9qSa-UFkaS7nvy4sj3slp5vsS0";
        
        // FAST LOAD CONFIGURATION
        const API_KEY = "AIzaSyAZwajn0BxvTqZdO4mqV-ut1-DnTqvfDp8"; // Yahan apni API Key dalein
        const SHEET_ID = "1rZJ7Tu-huQi_EVVSjjy7uhUumaxbM08WwsKjtjYJCn0";
        const SHEET_NAME = "Website Issues"; // Sheet ka naam exact hona chahiye

        let allData = [];
        let dateFilteredData = [];
        let filteredData = [];
        
        let assignableIssues = []; 
        let currentAssignIndex = 0; 
        let statusIssues = [];
        let currentStatusIndex = 0;
        let currentPage = 1;
        let rowsPerPage = 10;
        let currentStatusFilter = 'Total';
        let isTodayFilter = false;

        window.addEventListener('load', function() {
            fetchData();
            document.getElementById('rows-per-page').addEventListener('change', (e) => { rowsPerPage = +e.target.value; renderTable(); });
            document.getElementById('prev-btn').addEventListener('click', () => { if(currentPage>1) {currentPage--; renderTable();} });
            document.getElementById('next-btn').addEventListener('click', () => { if(currentPage < Math.ceil(filteredData.length/rowsPerPage)) {currentPage++; renderTable();} });
            document.getElementById('global-search').addEventListener('input', applyFilters);
            ['filter-module', 'filter-priority', 'filter-reported', 'filter-assignee'].forEach(id => { document.getElementById(id).addEventListener('change', applyFilters); });
        });

        async function fetchData() {
            try {
                let data = [];
                // Method 1: Try Direct Google Sheets API (Fastest)
                if (API_KEY && API_KEY !== "YOUR_GOOGLE_API_KEY") {
                    // Direct API call - No fallback to script to ensure speed
                    data = await fetchFromAPI();
                    console.log("Success: Data loaded via Google Sheets API");
                } else {
                    // Method 2: Fallback to Apps Script
                    data = await fetchFromScript();
                }
                
                allData = data.sort((a, b) => {
                    const idA = parseInt(a.id);
                    const idB = parseInt(b.id);
                    if (isNaN(idA)) return 1; // Jinka ID nahi hai wo last me jayenge
                    if (isNaN(idB)) return -1;
                    return idB - idA; // Newest ID first
                }); 
                filteredData = [...allData];
                
                document.getElementById('loader').classList.add('hidden');
                document.getElementById('dashboard-content').classList.remove('hidden');
                document.getElementById('connection-status').innerHTML = '<span class="relative flex h-2 w-2"><span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span> Connected';
                document.getElementById('connection-status').className = "ml-auto sm:ml-4 text-[10px] sm:text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1.5";
                
                populateFilters(); 
                document.getElementById('date-preset').value = 'all';
                applyDatePreset();
            } catch (err) {
                console.error(err);
                alert("Connection Error");
            }
        }

        async function fetchFromScript() {
            const res = await fetch(SCRIPT_URL, { redirect: "follow" });
            if (!res.ok) throw new Error("Failed");
            const json = await res.json();
            if(json.error) throw new Error(json.error);
            return json;
        }

        async function fetchFromAPI() {
            const range = encodeURIComponent(`'${SHEET_NAME}'!A2:L`);
            // Switch to spreadsheets.get to fetch 'hyperlink' field for Rich Text support
            // We request specific fields to keep it fast: formattedValue (text) and hyperlink (url)
            const fields = "sheets(data(rowData(values(formattedValue,hyperlink,effectiveValue))))";
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?ranges=${range}&fields=${fields}&key=${API_KEY}`;
            
            const res = await fetch(url, { cache: "no-store" });
            if (!res.ok) {
                const err = await res.json();
                throw new Error("API Error: " + (err.error ? err.error.message : res.statusText));
            }
            const json = await res.json();
            
            if (!json.sheets || !json.sheets[0] || !json.sheets[0].data || !json.sheets[0].data[0].rowData) return [];

            const rows = json.sheets[0].data[0].rowData;

            return rows.map((row, index) => {
                const cells = row.values || [];
                
                // Helper to get text safely
                const getVal = (i) => (cells[i] && cells[i].formattedValue) ? String(cells[i].formattedValue) : "";

                // Helper to get Date safely (Prefer Serial Number)
                const getDate = (i) => {
                    if (cells[i] && cells[i].effectiveValue && cells[i].effectiveValue.numberValue) {
                        return cells[i].effectiveValue.numberValue;
                    }
                    return getVal(i);
                };
                
                // Helper to get link (Checks Rich Text 'hyperlink' property first)
                const getLink = (i) => {
                    if (cells[i] && cells[i].hyperlink) return cells[i].hyperlink;
                    // Fallback: if no hyperlink object, check if text itself is a URL
                    const val = getVal(i);
                    if (val.startsWith("http")) return val;
                    return "";
                };

                return {
                    rowIndex: index + 2, // +2 because we started from A2
                    id: getVal(0),
                    module: getVal(1),
                    link: getLink(2), // Column C is index 2
                    description: getVal(3),
                    assign: getVal(4),
                    date: normalizeDate(getDate(5)), 
                    status: getVal(8),
                    reported: getVal(9),
                    priority: getVal(10)
                };
            }).filter(r => r.id || r.module); // Filter out empty rows
        }

        function normalizeDate(dateStr) {
            // Handle Excel/Google Sheets Serial Date (e.g., 46011.639...)
            // Google Sheets API with valueRenderOption=FORMULA returns raw numbers for dates
            if (dateStr && !isNaN(dateStr) && parseFloat(dateStr) > 20000) {
                const serial = parseFloat(dateStr);
                const date = new Date(1899, 11, 30); // Google Sheets epoch
                date.setDate(date.getDate() + Math.floor(serial));
                
                const totalSeconds = Math.round((serial - Math.floor(serial)) * 86400);
                const seconds = totalSeconds % 60;
                const minutes = Math.floor(totalSeconds / 60) % 60;
                const hours = Math.floor(totalSeconds / 3600);

                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                const h = String(hours).padStart(2, '0');
                const min = String(minutes).padStart(2, '0');
                const s = String(seconds).padStart(2, '0');
                
                return `${y}-${m}-${d} ${h}:${min}:${s}`;
            }

            // Convert DD/MM/YYYY HH:mm:ss to YYYY-MM-DD HH:mm:ss
            const match = String(dateStr).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(.*)$/);
            if (match) {
                return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}${match[4]}`;
            }
            return dateStr;
        }

        function formatDateDisplay(dateStr) {
            if (!dateStr) return "--";
            // Expecting YYYY-MM-DD...
            const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (match) {
                const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                const mIndex = parseInt(match[2], 10) - 1;
                return `${match[3]}-${months[mIndex]}`;
            }
            return dateStr.substring(0, 10);
        }

        function switchToCustomDate() {
            const presetSelect = document.getElementById('date-preset');
            const customOpt = presetSelect.querySelector('option[value="custom"]');
            if(customOpt) {
                customOpt.classList.remove('hidden');
                presetSelect.value = 'custom';
            }
            isTodayFilter = false;
        }

        function applyDatePreset() {
            const preset = document.getElementById('date-preset').value;
            const startInput = document.getElementById('date-start');
            const endInput = document.getElementById('date-end');
            isTodayFilter = (preset === 'today');

            if(preset !== 'custom') {
                 const customOpt = document.getElementById('date-preset').querySelector('option[value="custom"]');
                 if(customOpt) customOpt.classList.add('hidden');
            }

            const getLocalStr = (d) => {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            const today = new Date();
            let start, end;

            if (preset === 'today') {
                start = end = today;
            } else if (preset === 'week') {
                const day = today.getDay();
                const diff = today.getDate() - day + (day === 0 ? -6 : 1); 
                start = new Date(today);
                start.setDate(diff);
                end = new Date(); 
            } else if (preset === 'month') {
                start = new Date(today.getFullYear(), today.getMonth(), 1);
                end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            } else if (preset === 'all') {
                startInput.value = ''; endInput.value = '';
                applyFilters();
                return;
            } else {
                return; 
            }
            startInput.value = getLocalStr(start);
            endInput.value = getLocalStr(end);
            applyFilters();
        }

        function applyFilters() {
            const filters = {
                module: document.getElementById('filter-module').value,
                priority: document.getElementById('filter-priority').value,
                reported: document.getElementById('filter-reported').value,
                assignee: document.getElementById('filter-assignee').value,
                search: document.getElementById('global-search').value.toLowerCase(),
                start: document.getElementById('date-start').value,
                end: document.getElementById('date-end').value
            };

            // 1. First Filter by Date & Criteria (Independent of Status Card)
            dateFilteredData = allData.filter(d => {
                const matchesSearch = String(d.id).includes(filters.search) || 
                                      String(d.description).toLowerCase().includes(filters.search) || 
                                      String(d.module).toLowerCase().includes(filters.search) || 
                                      String(d.reported).toLowerCase().includes(filters.search);
                
                let dateMatch = true;
                if (filters.start || filters.end) {
                    if (d.date) {
                        const itemDateStr = d.date.substring(0, 10); 
                        if (filters.start && itemDateStr < filters.start) dateMatch = false;
                        if (filters.end && itemDateStr > filters.end) dateMatch = false;
                    } else {
                        dateMatch = false;
                    }
                }

                return matchesSearch && dateMatch &&
                       (!filters.module || d.module === filters.module) &&
                       (!filters.priority || d.priority === filters.priority) &&
                       (!filters.reported || d.reported === filters.reported) &&
                       (!filters.assignee || d.assign === filters.assignee);
            });

            // 2. Update Header Stats from this base data
            updateHeaderStats(dateFilteredData);

            // 3. Now apply Status Filter for Table/Charts
            filteredData = dateFilteredData.filter(d => {
                let statusMatch = true;
                if(currentStatusFilter !== 'Total') {
                    const s = String(d.status || "").toLowerCase().trim();
                    if(currentStatusFilter === 'Pending') statusMatch = s === 'pending';
                    else if(currentStatusFilter === 'Done') statusMatch = s === 'done';
                    else statusMatch = (s !== 'pending' && s !== 'done');
                }
                return statusMatch;
            });

            currentPage = 1; 
            renderTable(); 
            renderCharts(); 
            renderTrendChart();
        }

        function updateHeaderStats(dataSet) {
            let counts = { Total: 0, Pending: 0, Done: 0, Other: 0 };
            dataSet.forEach(d => {
                counts.Total++;
                const s = String(d.status || "").toLowerCase().trim();
                if(s === 'pending') counts.Pending++; 
                else if(s === 'done') counts.Done++; 
                else counts.Other++;
            });
            document.getElementById('count-total').innerText = counts.Total;
            document.getElementById('count-pending').innerText = counts.Pending;
            document.getElementById('count-done').innerText = counts.Done;
            document.getElementById('count-other').innerText = counts.Other;

            ['Total', 'Pending', 'Done', 'Other'].forEach(c => {
                const el = document.getElementById(`card-${c}`);
                // Reset classes to base state
                el.classList.remove('ring-2', 'ring-offset-2', 'ring-slate-400', 'ring-amber-400', 'ring-emerald-400', 'ring-indigo-400', 'bg-slate-50', 'bg-amber-50', 'bg-emerald-50', 'bg-indigo-50');
                
                if (currentStatusFilter === c) {
                     el.classList.add('ring-2', 'ring-offset-2');
                     if(c === 'Total') el.classList.add('ring-slate-400', 'bg-slate-50');
                     else if(c === 'Pending') el.classList.add('ring-amber-400', 'bg-amber-50');
                     else if(c === 'Done') el.classList.add('ring-emerald-400', 'bg-emerald-50');
                     else el.classList.add('ring-indigo-400', 'bg-indigo-50');
                }
            });
        }

        function filterByStatus(status) { 
            currentStatusFilter = status; 
            applyFilters(); 
        }
        
        function renderTrendChart() {
            const canvas = document.getElementById('trendChart'); if(!canvas) return; const ctx = canvas.getContext('2d');
            let labels = [], totalData = [], doneData = [], xLabel = "(Daily)";
            
            const dataToChart = dateFilteredData; 
            const startVal = document.getElementById('date-start').value;
            const endVal = document.getElementById('date-end').value;
            const isSingleDay = (startVal && endVal && startVal === endVal) || isTodayFilter;

            if (isSingleDay) {
                // Hourly Trend: Show ONLY Active Hours (30-min intervals if needed, but sticking to hours to avoid overcrowding)
                // Actually user asked for 30-min if needed, but let's do hours first, ONLY where data exists.
                xLabel = `(Active Hours for ${startVal || 'Today'})`;
                
                const hoursMap = {};
                // Pre-fill? No, user said only active hours.
                
                dataToChart.forEach(d => {
                   if(!d.date) return;
                   try {
                       // Format: YYYY-MM-DD HH:mm:ss
                       let timePart = "00:00:00";
                       if(d.date.includes(' ')) timePart = d.date.split(' ')[1];
                       else if(d.date.includes('T')) timePart = d.date.split('T')[1].substring(0, 8);

                       const hour = timePart.split(':')[0]; 
                       const min = timePart.split(':')[1];
                       
                       // Create 30-min bucket key (e.g., "14:00", "14:30")
                       const minBucket = parseInt(min) < 30 ? "00" : "30";
                       const key = `${hour}:${minBucket}`;

                       if(!hoursMap[key]) hoursMap[key] = { t: 0, d: 0 };
                       hoursMap[key].t++;
                       if(String(d.status).toLowerCase() === 'done') hoursMap[key].d++;
                   } catch(e) {}
                });
                
                labels = Object.keys(hoursMap).sort(); // Sort chronologically
                totalData = labels.map(k => hoursMap[k].t);
                doneData = labels.map(k => hoursMap[k].d);
            } else {
                const dateMap = {};
                dataToChart.forEach(d => { 
                    if(!d.date) return; 
                    const dateKey = d.date.substring(0, 10); 
                    if(!dateMap[dateKey]) dateMap[dateKey] = {t:0, d:0}; 
                    dateMap[dateKey].t++; 
                    if(String(d.status).toLowerCase()==='done') dateMap[dateKey].d++; 
                });
                labels = Object.keys(dateMap).sort();
                // Convert labels to DD-MMM for display
                const displayLabels = labels.map(l => formatDateDisplay(l));
                totalData = labels.map(k=>dateMap[k].t);
                doneData = labels.map(k=>dateMap[k].d);
                labels = displayLabels; // Swap for chart
            }

            document.getElementById('trend-label').innerText = xLabel;
            if(window.trendC) window.trendC.destroy();
            window.trendC = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [{label:'Reported', data:totalData, borderColor:'#6366f1', backgroundColor:'rgba(99, 102, 241, 0.1)', tension:0.3, fill:true}, {label:'Done', data:doneData, borderColor:'#10b981', backgroundColor:'rgba(16, 185, 129, 0.1)', tension:0.3, fill:true}] }, options: { responsive:true, maintainAspectRatio:false, scales:{y:{beginAtZero:true, ticks:{precision:0}}} } });
        }

        function renderCharts() {
            const pCounts = {}; const aCounts = {};
            filteredData.forEach(d => { pCounts[d.priority||"Unknown"]=(pCounts[d.priority]||0)+1; const a=d.assign||"Unassigned"; aCounts[a]=(aCounts[a]||0)+1; });
            const priorityParent = document.getElementById('priorityChart').parentNode; priorityParent.innerHTML = '<canvas id="priorityChart"></canvas>';
            new Chart(document.getElementById('priorityChart'), { type: 'doughnut', data: { labels: Object.keys(pCounts), datasets: [{ data: Object.values(pCounts), backgroundColor: ['#ef4444', '#f59e0b', '#10b981', '#6366f1'] }] }, options: { maintainAspectRatio: false } });
            
            const sortedAssignees = Object.entries(aCounts).sort((a,b)=>b[1]-a[1]);
            const labelsSorted = sortedAssignees.map(item => item[0]); const dataSorted = sortedAssignees.map(item => item[1]);
            const assignParent = document.getElementById('assigneeChart').parentNode; assignParent.innerHTML = '<canvas id="assigneeChart"></canvas>';
            const barColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
            new Chart(document.getElementById('assigneeChart'), { type: 'bar', data: { labels: labelsSorted, datasets: [{ label: 'Tasks', data: dataSorted, backgroundColor: barColors, borderRadius: 4 }] }, options: { maintainAspectRatio: false, plugins: { legend: {display:false} } } });
        }

        function populateFilters() {
            const modules = new Set(allData.map(d => d.module)); const priorities = new Set(allData.map(d => d.priority)); const reported = new Set(allData.map(d => d.reported).filter(r => r && r.trim() !== "")); const assignees = new Set(allData.map(d => d.assign));
            fillSelect('filter-module', modules); fillSelect('filter-priority', priorities); fillSelect('filter-reported', reported); fillSelect('filter-assignee', assignees);
            const modSelect = document.getElementById('modal-module'); modSelect.innerHTML = '<option value="">Select Module</option>'; ['Employer', 'Candidate', 'Admin', 'Home Page'].forEach(m => modSelect.innerHTML += `<option value="${m}">${m}</option>`);
            const priSelect = document.getElementById('modal-priority'); priSelect.innerHTML = '<option value="">Select Priority</option>'; ['High', 'Medium', 'Low', 'Critical'].forEach(p => priSelect.innerHTML += `<option value="${p}">${p}</option>`);
            const repSelect = document.getElementById('modal-reporter'); repSelect.innerHTML = '<option value="">Select Reporter</option>'; Array.from(reported).sort().forEach(r => { repSelect.innerHTML += `<option value="${r}">${r}</option>`; });
        }
        function fillSelect(id, set) { const el = document.getElementById(id); el.innerHTML = '<option value="">All</option>'; set.forEach(v => { if(v) el.innerHTML += `<option value="${v}">${v}</option>`; }); }
        function calculateNextId() { if (allData.length === 0) return 1001; const ids = allData.map(row => parseInt(row.id)).filter(id => !isNaN(id)); const maxId = ids.length > 0 ? Math.max(...ids) : 1000; return maxId + 1; }
        function openModal() { document.getElementById('issueModal').classList.remove('hidden'); document.body.classList.add('overflow-hidden'); document.getElementById('modal-id').value = calculateNextId(); document.getElementById('modal-row-index').value = ""; populateFilters(); }
        function closeModal() { document.getElementById('issueModal').classList.add('hidden'); document.body.classList.remove('overflow-hidden'); document.getElementById('issueForm').reset(); document.getElementById('upload-progress-container').classList.add('hidden'); document.getElementById('upload-status-text').classList.add('hidden'); document.getElementById('file-name-display').innerText = "No file chosen"; }
        function updateFileName() { const fileInput = document.getElementById('modal-file'); const display = document.getElementById('file-name-display'); if (fileInput.files.length > 0) display.innerText = fileInput.files[0].name; else display.innerText = "No file chosen"; }
        function lookupIssue(val) {
            const id = val.trim();
            const item = allData.find(d => d.id == id);
            if (item) {
                document.getElementById('modal-module').value = item.module; document.getElementById('modal-priority').value = item.priority; document.getElementById('modal-reporter').value = item.reported; document.getElementById('modal-desc').value = item.description; document.getElementById('modal-link').value = item.link || ""; document.getElementById('modal-row-index').value = item.rowIndex; document.getElementById('file-name-display').innerText = item.link ? "Existing file linked" : "No file";
            } else {
                document.getElementById('modal-row-index').value = "";
            }
        }
        async function submitIssue(e) {
            e.preventDefault(); const btn = document.getElementById('submit-btn'); const fileInput = document.getElementById('modal-file'); let finalLink = document.getElementById('modal-link').value; btn.disabled = true; btn.innerText = "Processing...";
            
            // File Upload (Cannot be optimistic, must wait for link)
            if (fileInput.files.length > 0) {
                try {
                    const tokenRes = await fetch(SCRIPT_URL + "?action=getToken"); const tokenData = await tokenRes.json();
                    document.getElementById('upload-progress-container').classList.remove('hidden');
                    document.getElementById('upload-status-text').classList.remove('hidden');
                    const metadata = { name: fileInput.files[0].name, mimeType: fileInput.files[0].type, parents: [DRIVE_FOLDER_ID] };
                    const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', { method: 'POST', headers: { 'Authorization': 'Bearer ' + tokenData.token, 'Content-Type': 'application/json' }, body: JSON.stringify(metadata) });
                    if(!initRes.ok) throw new Error("Upload Init Failed");
                    const locationUrl = initRes.headers.get('Location');
                    
                    const uploadedFile = await new Promise((resolve, reject) => { 
                        const xhr = new XMLHttpRequest(); 
                        xhr.open('PUT', locationUrl, true); 
                        xhr.upload.onprogress = (e) => {
                            if (e.lengthComputable) {
                                const percent = Math.round((e.loaded / e.total) * 100);
                                document.getElementById('upload-progress-bar').style.width = percent + '%';
                                document.getElementById('upload-status-text').innerText = `Uploading: ${percent}%`;
                            }
                        };
                        xhr.onload = () => { if (xhr.status === 200 || xhr.status === 201) resolve(JSON.parse(xhr.responseText)); else reject("Upload Failed"); }; 
                        xhr.onerror = () => reject("Network Error");
                        xhr.send(fileInput.files[0]); 
                    });
                    finalLink = `https://drive.google.com/file/d/${uploadedFile.id}/view`;
                } catch (err) { alert(err.message); btn.disabled = false; btn.innerText = "Submit"; return; }
            }

            // Optimistic UI Update (Instant Save)
            try {
                const rowIndex = document.getElementById('modal-row-index').value;
                let formData;
                const now = new Date();
                const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

                if (rowIndex) {
                    const existingItem = allData.find(d => d.rowIndex == rowIndex);
                    formData = { action: "update", rowIndex: rowIndex, id: document.getElementById('modal-id').value, date: existingItem ? existingItem.date : dateStr, module: document.getElementById('modal-module').value, priority: document.getElementById('modal-priority').value, reported: document.getElementById('modal-reporter').value, description: document.getElementById('modal-desc').value, link: finalLink, status: existingItem ? (existingItem.status || "") : "" };
                    
                    // Update Local Data Immediately
                    if(existingItem) {
                        existingItem.module = formData.module;
                        existingItem.priority = formData.priority;
                        existingItem.reported = formData.reported;
                        existingItem.description = formData.description;
                        existingItem.link = formData.link;
                    }
                } else {
                    formData = { action: "submit", id: document.getElementById('modal-id').value, date: dateStr, module: document.getElementById('modal-module').value, priority: document.getElementById('modal-priority').value, reported: document.getElementById('modal-reporter').value, description: document.getElementById('modal-desc').value, link: finalLink };
                    
                    // Add to Local Data Immediately
                    allData.unshift({
                        rowIndex: Date.now(), // Temp ID
                        id: String(formData.id),
                        module: formData.module,
                        link: formData.link,
                        description: formData.description,
                        assign: "",
                        date: dateStr,
                        status: "",
                        reported: formData.reported,
                        priority: formData.priority
                    });
                }
                
                // Update UI
                applyFilters();
                closeModal();
                alert("Saved!"); // Instant feedback

                // Send to Backend in Background
                fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(formData) }).catch(e => console.error("Background Sync Error", e));

            } catch (err) { alert(err.message); } finally { btn.disabled = false; btn.innerText = "Submit"; }
        }

        function openAssignSelector() { const reporters = new Set(allData.map(d => d.reported).filter(r => r)); const select = document.getElementById('assign-reporter-select'); select.innerHTML = '<option value="">Select...</option>'; reporters.forEach(r => select.innerHTML += `<option value="${r}">${r}</option>`); document.getElementById('assignSelectorModal').classList.remove('hidden'); }
        function closeAssignSelector() { document.getElementById('assignSelectorModal').classList.add('hidden'); }
        function startAssignment() {
            const reporter = document.getElementById('assign-reporter-select').value;
            if(!reporter) { alert("Select a reporter"); return; }
            assignableIssues = allData.filter(d => d.reported === reporter && (!d.assign || d.assign === "Unassigned" || d.assign.trim() === ""));
            if(assignableIssues.length === 0) { alert("No issues found"); return; }
            document.getElementById('assign-reporter-name').innerText = reporter; currentAssignIndex = 0;
            const devList = document.getElementById('developers-list'); devList.innerHTML = '';
            const assignees = new Set(allData.map(d => d.assign)); assignees.forEach(d => { if(d && d !== 'Unassigned') devList.innerHTML += `<option value="${d}">`; });
            closeAssignSelector(); document.getElementById('assignModal').classList.remove('hidden'); document.body.classList.add('overflow-hidden'); loadAssignIssue();
        }
        function loadAssignIssue() {
            if (currentAssignIndex >= assignableIssues.length) { alert("Done!"); closeAssignModal(); return; }
            const issue = assignableIssues[currentAssignIndex];
            document.getElementById('assign-id').value = issue.id; document.getElementById('assign-date').value = issue.date; document.getElementById('assign-module').value = issue.module; document.getElementById('assign-priority').value = issue.priority; document.getElementById('assign-desc').value = issue.description; document.getElementById('assign-row-index').value = issue.rowIndex; document.getElementById('assign-dev').value = ""; 
            const linkDiv = document.getElementById('assign-link-container'); linkDiv.innerHTML = issue.link ? `<a href="${issue.link}" target="_blank" class="text-blue-600 text-xs">View File</a>` : '<span class="text-gray-400 text-xs">None</span>';
        }
        async function submitAssignment(e) {
            e.preventDefault(); const btn = document.getElementById('assign-submit-btn'); btn.disabled = true; btn.innerText = 'Saving...';
            const payload = { action: "update", notificationType: "assign", rowIndex: document.getElementById('assign-row-index').value, id: document.getElementById('assign-id').value, module: document.getElementById('assign-module').value, priority: document.getElementById('assign-priority').value, description: document.getElementById('assign-desc').value, assignee: document.getElementById('assign-dev').value };
            
            // Optimistic Update
            try { 
                const t = assignableIssues[currentAssignIndex]; 
                t.description = payload.description; 
                t.assign = payload.assignee; 
                
                // Send to background
                fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) }).catch(e => console.error(e));

                currentAssignIndex++; 
                loadAssignIssue(); 
            } catch(err) { alert("Error"); } finally { btn.disabled = false; btn.innerText = "Assign & Save"; }
        }
        function skipAssignment() { currentAssignIndex++; loadAssignIssue(); }
        function closeAssignModal() { document.getElementById('assignModal').classList.add('hidden'); document.body.classList.remove('overflow-hidden'); applyFilters(); }
        
        function openStatusSelector() { const reporters = new Set(allData.map(d => d.reported).filter(r => r)); const select = document.getElementById('status-reporter-select'); select.innerHTML = '<option value="">Select...</option>'; reporters.forEach(r => select.innerHTML += `<option value="${r}">${r}</option>`); document.getElementById('statusSelectorModal').classList.remove('hidden'); }
        function closeStatusSelector() { document.getElementById('statusSelectorModal').classList.add('hidden'); }
        function startStatusUpdate() {
            const reporter = document.getElementById('status-reporter-select').value;
            if(!reporter) { alert("Select a reporter"); return; }
            statusIssues = allData.filter(d => d.reported === reporter && d.status !== 'Done');
            
            // Populate dropdown dynamically from sheet data
            const sSet = new Set(['Pending', 'Done', 'Dropped']); allData.forEach(d => { if(d.status) sSet.add(d.status); });
            const sel = document.getElementById('status-select'); sel.innerHTML = '<option value="">--</option>'; sSet.forEach(s => sel.innerHTML += `<option value="${s}">${s}</option>`);

            if(statusIssues.length === 0) { alert("No issues found"); return; }
            document.getElementById('status-reporter-name').innerText = reporter; currentStatusIndex = 0;
            closeStatusSelector(); document.getElementById('statusModal').classList.remove('hidden'); document.body.classList.add('overflow-hidden'); loadStatusIssue();
        }
        function loadStatusIssue() {
            if (currentStatusIndex >= statusIssues.length) { alert("Done!"); closeStatusModal(); return; }
            const issue = statusIssues[currentStatusIndex];
            document.getElementById('status-id').value = issue.id; document.getElementById('status-date').value = issue.date; document.getElementById('status-module').value = issue.module; document.getElementById('status-priority').value = issue.priority; document.getElementById('status-desc').value = issue.description; document.getElementById('status-row-index').value = issue.rowIndex; document.getElementById('status-select').value = issue.status || "";
            const linkDiv = document.getElementById('status-link-container'); linkDiv.innerHTML = issue.link ? `<a href="${issue.link}" target="_blank" class="text-blue-600 text-xs">View File</a>` : '<span class="text-gray-400 text-xs">None</span>';
        }
        async function submitStatusUpdate(e) {
            e.preventDefault(); const btn = document.getElementById('status-submit-btn'); btn.disabled = true; btn.innerText = 'Saving...';
            const now = new Date(); const newDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
            const payload = { action: "update", notificationType: "status", rowIndex: document.getElementById('status-row-index').value, id: document.getElementById('status-id').value, status: document.getElementById('status-select').value, module: document.getElementById('status-module').value, priority: document.getElementById('status-priority').value, description: document.getElementById('status-desc').value, date: newDate };
            
            // Optimistic Update
            try { 
                const t = statusIssues[currentStatusIndex]; 
                t.status = payload.status; 
                t.date = newDate; 
                
                // Send to background
                fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) }).catch(e => console.error(e));

                currentStatusIndex++; 
                loadStatusIssue(); 
            } catch(err) { alert("Error"); } finally { btn.disabled = false; btn.innerText = "Update & Save"; }
        }
        function skipStatusUpdate() { currentStatusIndex++; loadStatusIssue(); }
        function closeStatusModal() { document.getElementById('statusModal').classList.add('hidden'); document.body.classList.remove('overflow-hidden'); applyFilters(); }

        async function updateStatus(id, rowIndex, newStatus) {
            const item = allData.find(d => d.id == id);
            if(!item) return;
            
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const newDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

            const payload = { action: "update", notificationType: "status", rowIndex, id, status: newStatus, module: item.module, priority: item.priority, reported: item.reported, description: item.description, date: newDate };
            try { const res = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) }); await res.json(); item.status = newStatus; item.date = newDate; updateHeaderStats(dateFilteredData); renderTable(); renderCharts(); renderTrendChart(); } catch(e) { alert("Update failed"); }
        }

        function renderTable() {
            const tbody = document.getElementById('table-body'); tbody.innerHTML = '';
            if(filteredData.length === 0) { 
                tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-slate-400">No issues found matching criteria</td></tr>'; 
                document.getElementById('pagination-info').innerText = "Showing 0-0 of 0";
                return; 
            }
            const start = (currentPage - 1) * rowsPerPage;
            const pageData = filteredData.slice(start, start + rowsPerPage);
            document.getElementById('pagination-info').innerText = `Showing ${start+1}-${Math.min(start+rowsPerPage, filteredData.length)} of ${filteredData.length}`;
            const emptyState = '<span class="text-slate-300 font-light text-[10px]">—</span>';

            // Unique Statuses for Dropdown
            const statuses = Array.from(new Set(allData.map(d => String(d.status || "").trim()).filter(s => s))).sort();
            if(!statuses.includes("Pending")) statuses.unshift("Pending"); // Ensure Pending exists
            
            pageData.forEach(row => {
                let linkHtml = '<span class="text-slate-300 text-[10px]">None</span>';
                if(String(row.link || "").includes('drive.google.com')) {
                    const isDrive = true;
                    const icon = '<i class="fa-brands fa-google-drive text-green-600"></i>';
                    const text = 'Drive';
                    linkHtml = `<a href="${row.link}" target="_blank" class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-200 rounded-full hover:shadow-sm hover:border-indigo-300 transition text-[10px] font-semibold text-slate-600 no-underline">${icon} ${text}</a>`;
                } else if(row.link) {
                    linkHtml = `<a href="${row.link}" target="_blank" class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-200 rounded-full hover:shadow-sm hover:border-indigo-300 transition text-[10px] font-semibold text-slate-600 no-underline"><i class="fa-solid fa-link text-blue-500"></i> Link</a>`;
                }

                let pColor = 'bg-slate-100 text-slate-600';
                if(row.priority === 'High') pColor = 'bg-rose-50 text-rose-600 border border-rose-100';
                else if(row.priority === 'Medium') pColor = 'bg-amber-50 text-amber-600 border border-amber-100';
                else if(row.priority === 'Low') pColor = 'bg-emerald-50 text-emerald-600 border border-emerald-100';

                // Status Styling (Like Priority)
                const sText = row.status || "";
                let statusHtml = emptyState;
                if (sText) {
                    let sClass = 'bg-slate-100 text-slate-600 border border-slate-200';
                    if(sText === 'Done') sClass = 'bg-emerald-50 text-emerald-600 border border-emerald-100';
                    else if(sText === 'Pending') sClass = 'bg-amber-50 text-amber-600 border border-amber-100';
                    else if(sText === 'Dropped') sClass = 'bg-rose-50 text-rose-600 border border-rose-100';
                    statusHtml = `<span class="${sClass} px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">${sText}</span>`;
                }

                // Assignee Logic (Blank if unassigned)
                let assignHtml = emptyState;
                if(row.assign && row.assign !== 'Unassigned') {
                    assignHtml = `<div class="flex items-center gap-2"><div class="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold">${row.assign.charAt(0)}</div><span class="text-xs font-medium text-slate-600">${row.assign}</span></div>`;
                }

                tbody.innerHTML += `
                    <tr class="border-b border-gray-50 hover:bg-indigo-50/30 transition duration-150 group">
                        <td class="p-3 font-mono font-bold text-slate-500 text-[10px]">#${row.id}</td>
                        <td class="p-3"><span class="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-bold">${row.module}</span></td>
                        <td class="p-3 text-[10px] text-slate-500 whitespace-nowrap font-medium">${row.date ? formatDateDisplay(row.date) : emptyState}</td>
                        <td class="p-3 text-slate-700 text-xs leading-snug min-w-[200px]">${row.description || emptyState}</td>
                        <td class="p-3">${linkHtml}</td>
                        <td class="p-3"><span class="${pColor} px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">${row.priority}</span></td>
                        <td class="p-3">${assignHtml}</td>
                        <td class="p-3">${statusHtml}</td>
                    </tr>
                `;
            });
        }
