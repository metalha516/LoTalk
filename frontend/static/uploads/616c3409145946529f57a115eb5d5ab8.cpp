#include<bits/stdc++.h>
using namespace std;

int main(){
    int t;
    cin>>t;
    while(t--){
        string s;
        cin>>s;
        int ab = 0, ba = 0;
        for(int i = 0; i<s.length()-1; i++){
            if(s[i] == 'a' && s[i+1] == 'b') ab++;
            if(s[i] == 'b' && s[i+1] == 'a') ba++;
        }

        if(ab == ba) cout<<s<<endl;
        else if(ab > ba){
            s[0] = 'b';
            cout<<s<<endl;
        }else{
            s[0] = 'a';
            cout<<s<<endl;
        }
    }
}