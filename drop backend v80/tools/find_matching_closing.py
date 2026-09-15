import re
p=r'c:/Users/iorip/Downloads/bked/drop backend v54/structs/functions.js'
s=open(p,encoding='utf8').read()
lines=s.splitlines()
# find try at line 730
for i,l in enumerate(lines, start=1):
    if i>=720 and i<=740 and 'try' in l:
        print(i,l)
# find the first try after 720
for m in re.finditer(r'\btry\s*\{', s):
    line = s.count('\n',0,m.start())+1
    if line>=720 and line<=740:
        start_index=m.end()-1
        depth=0
        i=start_index
        while i<len(s):
            c=s[i]
            if c=='{': depth+=1
            elif c=='}':
                depth-=1
                if depth==0:
                    end_line=s.count('\n',0,i)+1
                    print('try at',line,'closes at',end_line)
                    break
            i+=1
        break
