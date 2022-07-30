# Walkthrough Instructions

The following list will walk you through running the traverse-box-items node script for the purpose of changing all the permission settings on all Shared Links in your enterprise from Open to Company.  Running the following script requires a basic level of knowledge of using the command line and a text editor.  

The node environment configuration instructions are written for a Mac user. 

If you already have a node environment configured, you can start at step 2, regardless of computer platform you are using. 

Traverse-box-items.js
https://github.com/kmcroft13/traverse-box-items

**Steps to Run** 

    1. Set up you node environment. 

        a. Install homebrew 

        b. Install node / NPM 

    2. Download/clone traverse-box-items 

        a.Download the folder: https://github.com/kmcroft13/traverse-box-items

        b.Navigate to the folder via the command line 

        c.Install dependencies by typing “npm install” 

    3. Download Shared Link Report from the box admin panel 

        a.Open the report and delete all columns except for Owner Login, Folder/File ID, Path 

        b.Update the column names to the following 

            i.Owner Login = owner_login 

            ii.Folder/File ID = item_id 

            iii.Path = type 

        c.Save as “input.csv” in the traverse-box-items folder 

            i. Double check to make sure your longer item_ids remain as numbers and aren’t converted to Excel's scientific notation 

    4. Configure the script 

        a. Update script to look for CSV 

            i. In the file config.json set CSV.enabled = true 

            ii. In the file config.json set Csv.filePath = “./input.csv” 

        b. Update Config to modify Data 

            i. In config.json set modifyData = True 

        c. Add credentials 

            i. https://developer.box.com/docs/setting-up-a-jwt-app

              * Type of App: Custom 

              * Authentication Method: OAuth 2.0 w/ JWT 

              * Application Access: Enterprise 

              * Name: traverse-box-items 

              * View Your App 

              * Required Application Scopes: 

                  * Read all Files and folders stored in Box 

                  * Read and write all files and folders stored in Box 

                  * Manage Users 

                  * Manage groups 

              * Advanced Features 

                  * Perform Actions as Users 

                  * Generate User Access Tokens 

              * In Box Admin panel > Enterprise Settings > Apps ==authorize app by adding client id 

            ii. Generate a public/private keypair 

              * JSON file will download - copy values from the JSON and add them to the config.json file 

        d. Copy the text from ./ModifySharedLInks.js and replace the text in user-defined-logic.js. 

            i. Update config.json to specify the sharing setting you want to update. Add the following values to the userDefinedConfigs in config.json 

              * "matchSharedLinkAccessLevel": "open", 

              * "newSharedLinkAccessLevel": "company" 

    5. Execute the script

        a. In the command line, while in the folder containing the script and the input.csv file, run the script by typing the following and pressing enter

          * node traverse-box-items

    6. Validate 

        a. Run another Shared Link report to verify that your links have been updated. 