## Optimisation

There are several optimisation I need,to make on this web app, I want to change it into a buisness form.

### Add a login and signup page
 want you to create a login and signup page, and add all the google, apple etc signup method, and also add cookies to help the user to stay logged in on his browser, no need for him to retype all his detail to access the web app.

 ### UX and UI Design
 Right now the app is very good but dark, I want you to inspire yourself from HubSpot's and monday.com's CRM templates and style and make the app more modern and beautiful and light weight in color, do not make something AI made, but more professional. But keep what we have already, but it must more easy and intuitive for user, Think and as UX and UI Designer. 

 ### Scrapping section.
 Right now I want you to redo the scrapping process in python not in js. Right now we use the link from google maps, which neeed us to go out of the web app search for a our lead on google maps copy the link and paste it on the web app, what I want you to do right now is create a scrapping process that is a abit different, Here under is the step by step process

1. The from the app, the user will use a filter section and search for the category of business and the city.
2. The app will automatically create the link with the category and city selected, and will start scrapping the leads from there. You do not need to use puppeteer, you can use selenium or any other tool that you think is better. By default, you can set the radius of the search to 10 kilometers.
3. Adapt the UI so that it propose either scrape directly from google map or scrape from our database that contains all the buisness details in France.
4. In the UI, propose an option to not add the lead to the database, but only add the lead to the campaign, it depends on the user request.

### Database.
I want you to change the database structure, and instead of having a sql database, I want you to use PostgreSQL for the database. and apply all the necessary data optimisations and structure for it, like index where necessary, cache, redis, partitionning if necessary, permission, different roles so as not to afffect the others, like admin, user, team member etc, and also with their different permission and access levels. In the Database. As you know we will have multiple user, and if we do not take good care of the database and persmission, we may have request taking too much time, or one user session action will affecting the overall fonctionning of the app, or maybe having another user process into another one, so this is the most crucial part, You'll think and act as a senior data architect and senior database administrator.

### Docker
I want you to create the whole web app in a docker container, and we will have sub-containers, either for the securityof the database, the front-end, back-end, api, etc, and propose a docker-compose.yml file that will allow us to deploy the app in a single command. and I also want you to create a .env.ex

### Versionning
A versionning system of the app, will be necessary so that when we make updates, we can easily rollback or apply the update to only one instance or  a group of instances, depending on our will, and will also allow us to track the changes and the versions of the app. You'll think and act as a senior devops engineer, use the best practices.

### Database security system
Read the database_security.md file understand how it works and then implement the security system to the database


**NOTE:** Create a detailed document for each process or step, explain very well, your decision and why you think this is the best way to handle it, I want to understand your thinking process, what are the pro and cons, why you choosed that, what are the security implications etc, I want to understand the whole picture, and be able to explain it to a client if needed. This document must be done before the implementation process, only when I approce with the document that you created in .md format that you'll proceed with the implementation.

Do not forget to comment all your code very well, it must look professional, and easy to understand, and you'll do it accross the overall all files, if they already exist or not, I want all the files to be well commented.



 


