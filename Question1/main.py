def triangle(m=3, n=4):
    # Assumption: m = number of rows, n = maximum width.
    # Both m and n are positive integers.
    # Widths are distributed proportionally.
    # One star in the first row when M > 1

    for i in range(m):
        width = n if m == 1 else 1 + i * (n - 1) // (m - 1)
        print("*" * width)

triangle()        #part 1
print()
triangle(4, 8)    
print()
triangle(3, 6)    
print()
triangle(5, 8)    
print()
triangle(6, 12)  
print()
triangle(7, 10)  
print()
triangle(2, 20)   
print()
triangle(10, 30)  