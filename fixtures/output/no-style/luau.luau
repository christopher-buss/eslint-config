local function greet(name)
    local message="Hello, "..name.."!"
    print(message)
    return message
end

local function add(a,b)
return a+b
end

local function processItems(items)
    local result={}
    for i=1,#items do
        local item=items[i]
        if item~=nil then
            if type(item)=="string" then
                table.insert(result,item:upper())
            else
                table.insert(result,tostring(item))
            end
        end
    end
    return result
end

local MyClass={}
MyClass.__index=MyClass

function MyClass.new(name,value)
    local self=setmetatable({},MyClass)
    self.name=name
    self.value=value
    return self
end

function MyClass:getName()
    return self.name
end

function MyClass:getValue()
    return self.value
end

function MyClass:toString()
    return string.format("%s: %d",self.name,self.value)
end

local function factorial(n)
    if n<=1 then
        return 1
    end
    return n*factorial(n-1)
end

local function filter(tbl,predicate)
    local filtered={}
    for _,v in ipairs(tbl) do
        if predicate(v) then
            table.insert(filtered,v)
        end
    end
    return filtered
end

local function map(tbl,transform)
    local mapped={}
    for i,v in ipairs(tbl) do
        mapped[i]=transform(v)
    end
    return mapped
end

local greeting=greet("World")
local sum=add(1,2)
local items=processItems({"hello","world",42,true})
local instance=MyClass.new("test",100)
local name=instance:getName()
local str=instance:toString()
local fact=factorial(10)
local evens=filter({1,2,3,4,5,6},function(n) return n%2==0 end)
local doubled=map({1,2,3},function(n) return n*2 end)

return {
    greet=greet,
    add=add,
    processItems=processItems,
    MyClass=MyClass,
    factorial=factorial,
    filter=filter,
    map=map,
}
