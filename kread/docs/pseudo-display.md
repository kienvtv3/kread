current_msb, current_lsb track current state in the e-ink, after each draw, these should be updated
target_msb, target_lsb are target state of the e-ink, will be updated to current_msb and current_lsb after drawing
bw_ram, red_ram decide which LUT level being used when call master activation to perform the drawing

MSB LSB COLOR           GRAY := MSB XOR LSB
0   0   BLACK           0
0   1   DARK GRAY       1
1   0   LIGHT GRAY      1
1   1   WHITE           0

BW  RED LEVEL
0   0   L0
0   1   L1
1   0   L2
1   1   L3

LUT for BW mode
L1 -> BLACK
L2 -> WHITE

LUT for GRAYSCALE mode
L1 -> DARK GRAY
L2 -> LIGHT GRAY



def render_bw(target_msb, refresh_mode):
    """
    perform single fast/half refresh

    if target pixel is BLACK i.e. target_msb[i] = 0                             -> bw_ram[i]  should be 0 BLACK
        current pixel is BLACK i.e current_msb[i] = current_lsb[i] = 0          -> red_ram[i] should be 0
        current pixel is WHITE i.e current_msb[i] = current_lsb[i] = 1          -> red_ram[i] should be 1
        current pixel is GRAY (LIGHT/DARK) i.e current_msb[i] != current_lsb[i] -> red_ram[i] should be 1   

    if target pixel is WHITE i.e. target_msb[i] = 1                             -> bw_ram[i]  should be 1 WHITE
        current pixel is BLACK i.e current_msb[i] = current_lsb[i] = 0          -> red_ram[i] should be 0
        current pixel is WHITE i.e current_msb[i] = current_lsb[i] = 1          -> red_ram[i] should be 1
        current pixel is GRAY (LIGHT/DARK) i.e current_msb[i] != current_lsb[i] -> red_ram[i] should be 0   

    --> if current pixel is GRAY        -> red_ram[i] should be ~target_msb[i]
        if current pixel is BLACK/WHITE -> red_ram[i] should be current_msb[i]
    """

    current_is_gray := current_msb XOR current_lsb
    red_ram := (current_is_gray & ~target_msb) | (~current_is_gray & current_msb)

    bw_ram := target_msb 

    set_refresh_mode(refresh_mode)
    set_lut(bw)
    call_master_activation() # this will draw to e-ink

    current_msb := target_msb
    current_lsb := target_msb


def render_grayscale(target_msb, target_lsb, refresh_mode):
    """
    perform first fast/half refresh, then perform second fast refresh

    step 1: render b&w
        if target pixel is BLACK i.e. target_msb[i] = target_lsb[i] = 0             -> bw_ram[i]  should be 0 BLACK
            current pixel is BLACK i.e current_msb[i] = current_lsb[i] = 0          -> red_ram[i] should be 0
            current pixel is WHITE i.e current_msb[i] = current_lsb[i] = 1          -> red_ram[i] should be 1
            current pixel is GRAY (LIGHT/DARK) i.e current_msb[i] != current_lsb[i] -> red_ram[i] should be 1   

        if target pixel is WHITE i.e. target_msb[i] = target_lsb[i] = 1             -> bw_ram[i]  should be 1 WHITE
            current pixel is BLACK i.e current_msb[i] = current_lsb[i] = 0          -> red_ram[i] should be 0
            current pixel is WHITE i.e current_msb[i] = current_lsb[i] = 1          -> red_ram[i] should be 1
            current pixel is GRAY (LIGHT/DARK) i.e current_msb[i] != current_lsb[i] -> red_ram[i] should be 0   

        if target pixel is GRAY (LIGHT/DARK) i.e. target_msb[i] != target_lsb[i]    -> bw_ram[i]  should be 1 WHITE
            current pixel is BLACK i.e current_msb[i] = current_lsb[i] = 0          -> red_ram[i] should be 0
            current pixel is WHITE i.e current_msb[i] = current_lsb[i] = 1          -> red_ram[i] should be 1
            current pixel is GRAY (LIGHT/DARK) i.e current_msb[i] != current_lsb[i] -> red_ram[i] should be 0    

        --> this step target pixel should be 
                BLACK if target pixel is BLACK
                WHITE if target pixel is WHITE or GRAY
            if current pixel is GRAY        -> red_ram[i] should be ~bw_ram[i] (not this step target pixel color) -> make GRAY either BLACK or WHITE
            if current pixel is BLACK/WHITE -> red_ram[i] should be current_msb[i] (current pixel color)

        set current_msb := current_lsb := bw_ram        # optional

    step 2: render gray
        if target pixel is BLACK i.e. target_msb[i] = target_lsb[i] = 0                 -> bw_ram[i]  should be 0 BLACK
            previous step pixel must be BLACK                                           -> red_ram[i] should be 0

        if target pixel is WHITE i.e. target_msb[i] = target_lsb[i] = 1                 -> bw_ram[i]  should be 1 WHITE
            previous step pixel must be WHITE                                           -> red_ram[i] should be 1

        if target pixel is LIGHT GRAY i.e. target_msb[i] = 1 and target_lsb[i] = 0      
            previous step pixel must be WHITE                                           -> bw_ram[i] should be 1 and red_ram[i] should be 0

        if target pixel is DARK GRAY i.e. target_msb[i] = 0 and target_lsb[i] = 1      
            previous step pixel must be WHITE                                           -> bw_ram[i] should be 0 and red_ram[i] should be 1

        --> if target pixel is BLACK/WHITE -> bw_ram[i] = target_msb[i] and red_ram[i] = target_lsb[i]
            if target pixel is LIGHT GRAY  -> bw_ram[i] = target_msb[i] = 1 and red_ram[i] = target_lsb[i] = 0
            if target pixel is DARK GRAY   -> bw_ram[i] = target_msb[i] = 0 and red_ram[i] = target_lsb[i] = 1

        bw_ram := target_msb
        red_ram := target_lsb
    """
    target_is_black := target_msb NOR target_lsb
    target_bw := (target_is_black & 0) | (~target_is_black & 1)

    render_bw(target_bw, refresh_mode)

    red_ram := target_lsb
    bw_ram := target_msb

    set_refresh_mode(fast)
    set_lut(grayscale)
    call_master_activation() # this will draw to e-ink

    current_msb := target_msb
    current_lsb := target_msb