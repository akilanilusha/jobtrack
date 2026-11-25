# JobTrack – Playwright Job Monitoring 🚀

JobTrack is a configurable job-monitoring tool that automatically visits company career pages, searches for relevant job opportunities, tracks previously discovered listings, and generates reports.

It is designed to make job hunting easier by reducing the time spent manually checking company career pages every day.

Currently, the project primarily focuses on IT-related roles such as Software Engineer, Full-Stack Developer, Frontend Developer, Backend Developer, and related positions.

## ✨ Features

- **Automated Job Monitoring** – Automatically visits configured company career pages using Playwright.
- **Configurable Companies** – Add and manage the companies you want to monitor.
- **Keyword-Based Filtering** – Filter job listings using job titles, technologies, and keywords.
- **Exclude Keywords** – Exclude irrelevant job listings based on your criteria.
- **Location Filtering** – Filter jobs by location or search across all locations.
- **New Job Detection** – Compare listings against previously discovered jobs.
- **HTML & CSV Reports** – Generate reports containing matching job opportunities.
- **Local Web Dashboard** – Manage and track discovered job opportunities.
- **Job Application Tracking** – Track jobs as Saved, Applied, Interview, Offer, or Rejected.
- **Browser Automation** – Powered by Playwright and Chromium.
- **No Additional API Keys Required** – Run locally without configuring external API keys.

---

## 📋 Requirements

Before installing JobTrack, make sure you have the following:

- [Node.js 20+](https://nodejs.org/)
- npm (included with Node.js)
- Git

Verify your installations:

```bash
node --version
npm --version
git --version
```

---

## ⚙️ Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
```

Navigate to the project directory:

```bash
cd jobtrack
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Install Playwright Chromium

JobTrack uses Playwright to automate browser interactions.

Install the Chromium browser:

```bash
npx playwright install chromium
```

### 4. Create Your Company Configuration

Copy the example company configuration:

**macOS / Linux:**

```bash
cp companies.example.json companies.json
```

**Windows (Command Prompt):**

```cmd
copy companies.example.json companies.json
```

**Windows (PowerShell):**

```powershell
Copy-Item companies.example.json companies.json
```

---

## 🏢 Configure Target Companies

Open `companies.json` and add the companies you want to monitor.

Example:

```json
[
  {
  "name": "Microsoft",
  "websiteUrl": "https://www.microsoft.com",
  "careersUrl": "https://careers.microsoft.com/",
  "enabled": true,
  "careersType": null,
  "ats": null,
  "atsToken": null
}
]
```

### Configuration fields

| Field | Description |
|---|---|
| `name` | Company name |
| `careersUrl` | Company's career page URL |
| `enabled` | Enable or disable monitoring for this company |
| `jobLinkSelector` | Optional CSS selector for identifying job links |

### About `jobLinkSelector`

The `jobLinkSelector` field is optional.

When not provided, JobTrack uses its generic link detection logic to identify possible job listings and filters them based on visible link text.

For better results, you can configure a selector that specifically targets job links on the company's career page.

Some career websites use unusual page structures, iframes, or dynamically loaded content. These websites may require dedicated handling or an adapter.

---

## 🔍 Configure Job Search Criteria

Open `config.json` to customize your job search preferences.

### `includeKeywords`

Keywords or job titles you want to find.

Examples:

- Software Engineer
- Associate Software Engineer
- Full-Stack Developer
- Frontend Developer
- Backend Developer
- React Developer
- .NET Developer

### `excludeKeywords`

Keywords used to exclude listings that are not relevant to your search.

For example, you may want to exclude:

- Senior
- Lead
- Manager
- Internship

Customize these according to your job search preferences.

### `locations`

Optional location filter.

You can specify the locations you are interested in. Leave the list empty if you want to match jobs from any location.

---

## ▶️ Running the Job Scanner

### Standard Scan

Run the scanner:

```bash
npm run scan
```

JobTrack will automatically visit the configured company career pages, collect potential job listings, and filter them according to your configured search criteria.

### Run with a Visible Browser

If you want to watch the browser automation while it scans companies, run:

```bash
npm run scan:headed
```

This starts the scan with a visible browser window.

---

## 🆕 How New Job Detection Works

JobTrack keeps track of previously discovered job listings using:

```text
data/seen-jobs.json
```

### First Scan

During the first scan, matching listings are treated as new to the tracker because there are no previously recorded listings to compare against.

### Subsequent Scans

On later scans, JobTrack compares job URLs against previously recorded listings.

Only URLs that have not been seen before are identified as new to the tracker.

> A job marked as new means it has newly been discovered by JobTrack. It does not necessarily mean the employer published it recently.

---

## 📊 Reports

JobTrack generates reports inside the:

```text
reports/
```

Reports are available in:

- **HTML** – View job listings in a browser-friendly format.
- **CSV** – Export job listings for use in spreadsheets or other tools.

Reports contain matching job opportunities discovered during the scan.

---

## 🌐 Web Dashboard

JobTrack includes a local web dashboard for viewing and managing job opportunities.

### Start the Dashboard

Open a terminal in the project directory and run:

```bash
npm run dashboard
```

Then open the following URL in your browser:

**http://localhost:4173**

### Dashboard Views

The dashboard includes:

- **Overview** – Summary of tracked job opportunities.
- **New Jobs** – Newly discovered listings.
- **Applied Jobs** – Jobs you've applied for.
- **Saved Jobs** – Opportunities you want to keep for later.
- **Companies** – Your configured target companies.

### Track Your Applications

You can manage your job-search progress directly from the dashboard:

- **Save** – Keep a job for later.
- **Mark Applied** – Move a listing to your applied jobs.
- **Update Status** – Track outcomes such as Interview, Offer, or Rejected.

Application statuses are stored locally alongside job data and are preserved when subsequent scans update job details.

---

## 🖥️ Run Scanner & Dashboard Together

You can run the scanner and dashboard simultaneously.

### Terminal 1 – Job Scanner

```bash
npm run scan
```

### Terminal 2 – Dashboard

Open another terminal in the same project directory:

```bash
npm run dashboard
```

Keep both processes running while using the application.

After a new scan completes—or while scan results are being saved—refresh the dashboard to view the updated job listings.

---

## ⏰ Schedule Daily Scans

You can schedule JobTrack to run automatically once per day using Cron on macOS or Linux.

### 1. Open the Cron Editor

```bash
crontab -e
```

### 2. Add a Schedule

Example: Run JobTrack every day at 8:00 AM.

```cron
0 8 * * * cd /absolute/path/to/jobtrack && /usr/bin/npm run scan >> scan.log 2>&1
```

Replace:

- `/absolute/path/to/jobtrack` with the actual project directory.
- `/usr/bin/npm` with the actual npm executable path on your machine, if different.

To find the npm path:

```bash
which npm
```

### Important

- Your computer must be powered on.
- It must be awake at the scheduled time.
- An active internet connection is required.
- The scan log will be appended to `scan.log`.

---

## 📁 Project Structure

```text
jobtrack/
│
├── dashboard/              # Dashboard frontend
├── data/                  # Local application data
│   └── seen-jobs.json     # Previously discovered job listings
├── reports/                # Generated HTML and CSV reports
│
├── src/
│   ├── dashboard.ts        # Dashboard functionality
│   ├── index.ts            # Scanner entry point
│   ├── matcher.ts           # Job matching and filtering
│   ├── report.ts            # Report generation
│   ├── scraper.ts           # Career page scraping
│   ├── storage.ts           # Local data storage
│   └── types.ts              # Type definitions
│
├── .gitignore
├── companies.example.json    # Example company configuration
├── companies.json           # Your personal company configuration
├── config.json              # Job search settings
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md
```

---

## ⚠️ Important Limitations

- JobTrack monitors the career pages you configure. It does not automatically discover every company's career page.
- Career websites have different structures. Generic job extraction may not work perfectly on every website.
- Some websites may require custom selectors or dedicated adapters.
- Some career sites load jobs through APIs, iframes, or dynamic content that may require special handling.
- Job publication dates may not always be available. In such cases, the publication date may appear as `Not listed`.
- A job first discovered by JobTrack is not necessarily a newly published vacancy.
- This is a local, single-user dashboard. Do not expose it directly to the public internet without implementing appropriate authentication and security controls.

---

## 🤝 Contributing

Contributions, ideas, feedback, bug reports, and feature suggestions are welcome!

If you have ideas to improve JobTrack or would like to contribute:

1. Fork the repository.
2. Create a branch for your changes.
3. Make your changes.
4. Test your changes locally.
5. Submit a Pull Request.

Let's make job searching a little easier together!

---

## 🔒 Responsible Usage

Please use JobTrack responsibly.

- Respect each website's Terms of Service.
- Follow applicable robots and access guidelines.
- Respect rate limits and avoid excessive requests.
- Do not bypass logins, CAPTCHAs, or anti-bot protections.
- Prefer official job feeds or APIs when available.
- Use automation responsibly and avoid disrupting the websites you monitor.

---

## 🎯 Purpose

JobTrack was created to make tracking job opportunities across target companies easier and less time-consuming.

Instead of manually checking multiple career pages every day, automate the process and spend more time preparing for the opportunities you find.

**Happy job hunting! 🚀**

---

*Built for job seekers. Open to the community.*